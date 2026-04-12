import { randomUUID } from "node:crypto";

import type {
  CredentialFieldSchema,
  CredentialInstanceId,
  CredentialMaterialSourceKind,
  CredentialTypeId,
} from "@codemation/core";

import { CoreTokens, inject, injectable } from "@codemation/core";

import { ApplicationRequestError } from "../../application/ApplicationRequestError";

import type {
  CreateCredentialInstanceRequest,
  CredentialInstanceDto,
  CredentialInstanceWithSecretsDto,
  CredentialOAuth2ConnectionDto,
  UpdateCredentialInstanceRequest,
} from "../../application/contracts/CredentialContractsRegistry";

import { ApplicationTokens } from "../../applicationTokens";

import { CredentialFieldEnvOverlayService } from "./CredentialFieldEnvOverlayService";
import { CredentialMaterialResolver } from "./CredentialMaterialResolver";
import { CredentialOAuth2ScopeResolver } from "./CredentialOAuth2ScopeResolver";
import { CredentialSecretCipher } from "./CredentialSecretCipher";
import type {
  CredentialInstanceRecord,
  CredentialSecretMaterialRecord,
  CredentialSecretRef,
  CredentialStore,
  CredentialTestRecord,
  AnyCredentialType,
  JsonRecord,
  MutableCredentialSessionService,
} from "./CredentialServices";
import { CredentialTypeRegistryImpl } from "./CredentialServices";

@injectable()
export class CredentialInstanceService {
  constructor(
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CredentialTypeRegistryImpl)
    private readonly credentialTypeRegistry: CredentialTypeRegistryImpl,
    @inject(CredentialSecretCipher)
    private readonly credentialSecretCipher: CredentialSecretCipher,
    @inject(CredentialFieldEnvOverlayService)
    private readonly credentialFieldEnvOverlayService: CredentialFieldEnvOverlayService,
    @inject(CredentialMaterialResolver)
    private readonly credentialMaterialResolver: CredentialMaterialResolver,
    @inject(CredentialOAuth2ScopeResolver)
    private readonly credentialOAuth2ScopeResolver: CredentialOAuth2ScopeResolver,
    @inject(CoreTokens.CredentialSessionService)
    private readonly credentialSessionService: MutableCredentialSessionService,
  ) {}

  async listInstances(): Promise<ReadonlyArray<CredentialInstanceDto>> {
    const instances = await this.credentialStore.listInstances();
    const latestTestResults = await this.credentialStore.getLatestTestResults(
      instances.map((instance) => instance.instanceId),
    );
    return await Promise.all(
      instances.map(async (instance) => await this.toDto(instance, latestTestResults.get(instance.instanceId))),
    );
  }

  async getInstance(instanceId: CredentialInstanceId): Promise<CredentialInstanceDto | undefined> {
    const instance = await this.credentialStore.getInstance(instanceId);
    if (!instance) {
      return undefined;
    }
    const latestTestResult = await this.credentialStore.getLatestTestResult(instanceId);
    return await this.toDto(instance, latestTestResult);
  }

  async getInstanceWithSecrets(
    instanceId: CredentialInstanceId,
  ): Promise<CredentialInstanceWithSecretsDto | undefined> {
    const instance = await this.credentialStore.getInstance(instanceId);
    if (!instance) {
      return undefined;
    }
    const latestTestResult = await this.credentialStore.getLatestTestResult(instanceId);
    const base = await this.toDto(instance, latestTestResult);
    try {
      const material = await this.credentialMaterialResolver.resolveMaterial(instance);
      const secretConfig = Object.fromEntries(Object.entries(material).map(([k, v]) => [k, String(v ?? "")])) as Record<
        string,
        string
      >;
      const envSecretRefs =
        instance.secretRef.kind === "env" ? (instance.secretRef.envByField as Record<string, string>) : undefined;
      return { ...base, secretConfig, envSecretRefs };
    } catch {
      return base;
    }
  }

  async create(request: CreateCredentialInstanceRequest): Promise<CredentialInstanceDto> {
    const credentialType = this.requireCredentialType(request.typeId);
    const publicFields = credentialType.definition.publicFields ?? [];
    const secretFields = credentialType.definition.secretFields ?? [];
    this.validateRequestFields({
      displayName: request.displayName,
      publicFields,
      publicConfig: request.publicConfig ?? {},
      secretFields,
      sourceKind: request.sourceKind,
      secretConfig: request.secretConfig ?? {},
      envSecretRefs: request.envSecretRefs ?? {},
    });
    const timestamp = new Date().toISOString();
    const strippedPublic = this.stripEnvManagedFieldValues(publicFields, request.publicConfig ?? {});
    const strippedSecretForRef = this.stripEnvManagedFieldValues(secretFields, request.secretConfig ?? {});
    const instance: CredentialInstanceRecord = {
      instanceId: randomUUID(),
      typeId: request.typeId,
      displayName: request.displayName.trim(),
      sourceKind: request.sourceKind,
      publicConfig: Object.freeze({ ...strippedPublic }),
      secretRef: this.createSecretRef(request.sourceKind, strippedSecretForRef, request.envSecretRefs ?? {}),
      tags: Object.freeze([...(request.tags ?? [])]),
      setupStatus: credentialType.definition.auth?.kind === "oauth2" ? "draft" : "ready",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.credentialStore.saveInstance({
      instance,
      secretMaterial: this.createSecretMaterial(instance, strippedSecretForRef, timestamp),
    });
    this.credentialSessionService.evictInstance(instance.instanceId);
    return this.toDto(instance, undefined);
  }

  async update(
    instanceId: CredentialInstanceId,
    request: UpdateCredentialInstanceRequest,
  ): Promise<CredentialInstanceDto> {
    const existing = await this.requireInstance(instanceId);
    const credentialType = this.requireCredentialType(existing.typeId);
    const mergedPublicRaw = { ...(request.publicConfig ?? existing.publicConfig) };
    const updatedAt = new Date().toISOString();
    const nextSecretConfig = request.secretConfig;
    const nextEnvSecretRefs = request.envSecretRefs;
    const secretFields = credentialType.definition.secretFields ?? [];
    this.validateRequestFields({
      displayName: request.displayName ?? existing.displayName,
      publicFields: credentialType.definition.publicFields ?? [],
      publicConfig: mergedPublicRaw,
      secretFields,
      sourceKind: existing.sourceKind,
      secretConfig: nextSecretConfig ?? {},
      envSecretRefs: nextEnvSecretRefs ?? {},
      allowSecretOmission: true,
    });
    const publicConfig = Object.freeze({
      ...this.stripEnvManagedFieldValues(credentialType.definition.publicFields ?? [], mergedPublicRaw),
    });
    const mergedSecretForRef =
      nextSecretConfig !== undefined ? this.stripEnvManagedFieldValues(secretFields, nextSecretConfig) : undefined;
    const instance: CredentialInstanceRecord = {
      ...existing,
      displayName: request.displayName?.trim() || existing.displayName,
      publicConfig,
      tags: Object.freeze([...(request.tags ?? existing.tags)]),
      setupStatus: request.setupStatus ?? existing.setupStatus,
      secretRef:
        nextSecretConfig || nextEnvSecretRefs
          ? this.createSecretRef(existing.sourceKind, mergedSecretForRef ?? {}, nextEnvSecretRefs ?? {})
          : existing.secretRef,
      updatedAt,
    };
    await this.credentialStore.saveInstance({
      instance,
      secretMaterial:
        nextSecretConfig !== undefined && mergedSecretForRef !== undefined
          ? this.createSecretMaterial(instance, mergedSecretForRef, updatedAt)
          : undefined,
    });
    this.credentialSessionService.evictInstance(instance.instanceId);
    return this.toDto(instance, await this.credentialStore.getLatestTestResult(instance.instanceId));
  }

  async delete(instanceId: CredentialInstanceId): Promise<void> {
    await this.credentialStore.deleteInstance(instanceId);
    this.credentialSessionService.evictInstance(instanceId);
  }

  async disconnectOAuth2(instanceId: CredentialInstanceId): Promise<CredentialInstanceDto> {
    const instance = await this.requireInstance(instanceId);
    const credentialType = this.requireCredentialType(instance.typeId);
    if (credentialType.definition.auth?.kind !== "oauth2") {
      throw new ApplicationRequestError(400, `Credential instance ${instanceId} does not use OAuth2.`);
    }
    const updatedInstance: CredentialInstanceRecord = {
      ...instance,
      setupStatus: "draft",
      updatedAt: new Date().toISOString(),
    };
    await this.credentialStore.saveInstance({
      instance: updatedInstance,
    });
    await this.credentialStore.deleteOAuth2Material(instanceId);
    this.credentialSessionService.evictInstance(instanceId);
    return await this.toDto(updatedInstance, await this.credentialStore.getLatestTestResult(instanceId));
  }

  async requireInstance(instanceId: CredentialInstanceId): Promise<CredentialInstanceRecord> {
    const instance = await this.credentialStore.getInstance(instanceId);
    if (!instance) {
      throw new ApplicationRequestError(404, `Unknown credential instance: ${instanceId}`);
    }
    return instance;
  }

  private createSecretRef(
    sourceKind: CredentialMaterialSourceKind,
    secretConfig: JsonRecord,
    envSecretRefs: Readonly<Record<string, string>>,
  ): CredentialSecretRef {
    if (sourceKind === "db") {
      return { kind: "db" };
    }
    if (sourceKind === "env") {
      return {
        kind: "env",
        envByField: Object.freeze({ ...envSecretRefs }),
      };
    }
    return {
      kind: "code",
      value: Object.freeze({ ...secretConfig }),
    };
  }

  private createSecretMaterial(
    instance: CredentialInstanceRecord,
    secretConfig: JsonRecord,
    updatedAt: string,
  ): CredentialSecretMaterialRecord | undefined {
    if (instance.sourceKind !== "db") {
      return undefined;
    }
    const encrypted = this.credentialSecretCipher.encrypt(secretConfig);
    return {
      instanceId: instance.instanceId,
      encryptedJson: encrypted.encryptedJson,
      encryptionKeyId: encrypted.encryptionKeyId,
      schemaVersion: encrypted.schemaVersion,
      updatedAt,
    };
  }

  private validateRequestFields(
    args: Readonly<{
      displayName: string;
      publicFields: ReadonlyArray<CredentialFieldSchema>;
      publicConfig: JsonRecord;
      secretFields: ReadonlyArray<CredentialFieldSchema>;
      sourceKind: CredentialMaterialSourceKind;
      secretConfig: JsonRecord;
      envSecretRefs: Readonly<Record<string, string>>;
      allowSecretOmission?: boolean;
    }>,
  ): void {
    if (!args.displayName || args.displayName.trim().length === 0) {
      throw new ApplicationRequestError(400, "Credential displayName is required.");
    }
    this.assertRequiredFields("publicConfig", args.publicFields, args.publicConfig);
    if (args.sourceKind === "db") {
      if (!args.allowSecretOmission || Object.keys(args.secretConfig).length > 0) {
        this.assertRequiredFields("secretConfig", args.secretFields, args.secretConfig);
      }
      return;
    }
    if (args.sourceKind === "env") {
      if (!args.allowSecretOmission || Object.keys(args.envSecretRefs).length > 0) {
        this.assertRequiredEnvFields(args.secretFields, args.envSecretRefs);
      }
      return;
    }
    if (!args.allowSecretOmission || Object.keys(args.secretConfig).length > 0) {
      this.assertRequiredFields("secretConfig", args.secretFields, args.secretConfig);
    }
  }

  private stripEnvManagedFieldValues(fields: ReadonlyArray<CredentialFieldSchema>, value: JsonRecord): JsonRecord {
    const out: Record<string, unknown> = { ...value };
    for (const field of fields) {
      if (this.credentialFieldEnvOverlayService.isFieldResolvedFromEnv(field)) {
        delete out[field.key];
      }
    }
    return Object.freeze(out);
  }

  private assertRequiredFields(
    fieldName: string,
    schema: ReadonlyArray<CredentialFieldSchema>,
    value: JsonRecord,
  ): void {
    const missing = schema
      .filter((field) => field.required === true)
      .filter((field) => !this.credentialFieldEnvOverlayService.isFieldResolvedFromEnv(field))
      .filter((field) => value[field.key] === undefined || value[field.key] === null || value[field.key] === "")
      .map((field) => field.key);
    if (missing.length > 0) {
      throw new ApplicationRequestError(400, `Missing required ${fieldName} field(s): ${missing.join(", ")}`);
    }
  }

  private assertRequiredEnvFields(
    schema: ReadonlyArray<CredentialFieldSchema>,
    envSecretRefs: Readonly<Record<string, string>>,
  ): void {
    const missing = schema
      .filter((field) => field.required === true)
      .filter((field) => !this.credentialFieldEnvOverlayService.isFieldResolvedFromEnv(field))
      .filter((field) => !envSecretRefs[field.key] || envSecretRefs[field.key]!.trim().length === 0)
      .map((field) => field.key);
    if (missing.length > 0) {
      throw new ApplicationRequestError(400, `Missing required envSecretRefs field(s): ${missing.join(", ")}`);
    }
  }

  private requireCredentialType(typeId: CredentialTypeId): AnyCredentialType {
    const credentialType = this.credentialTypeRegistry.getCredentialType(typeId);
    if (!credentialType) {
      throw new ApplicationRequestError(400, `Unknown credential type: ${typeId}`);
    }
    return credentialType;
  }

  async markOAuth2Connected(instanceId: CredentialInstanceId, connectedAt: string): Promise<void> {
    const instance = await this.requireInstance(instanceId);
    await this.credentialStore.saveInstance({
      instance: {
        ...instance,
        setupStatus: "ready",
        updatedAt: connectedAt,
      },
    });
    this.credentialSessionService.evictInstance(instanceId);
  }

  private async toDto(
    instance: CredentialInstanceRecord,
    latestTestResult: CredentialTestRecord | undefined,
  ): Promise<CredentialInstanceDto> {
    const oauth2Connection = await this.toOAuth2ConnectionDto(instance);
    return {
      instanceId: instance.instanceId,
      typeId: instance.typeId,
      displayName: instance.displayName,
      sourceKind: instance.sourceKind,
      publicConfig: instance.publicConfig,
      tags: instance.tags,
      setupStatus: instance.setupStatus,
      createdAt: instance.createdAt,
      updatedAt: instance.updatedAt,
      latestHealth: latestTestResult?.health,
      oauth2Connection,
    };
  }

  private async toOAuth2ConnectionDto(
    instance: CredentialInstanceRecord,
  ): Promise<CredentialOAuth2ConnectionDto | undefined> {
    const credentialType = this.credentialTypeRegistry.getCredentialType(instance.typeId);
    if (credentialType?.definition.auth?.kind !== "oauth2") {
      return undefined;
    }
    const providerId =
      "providerId" in credentialType.definition.auth ? credentialType.definition.auth.providerId : "custom";
    const material = await this.credentialStore.getOAuth2Material(instance.instanceId);
    if (!material) {
      const requestedScopes = this.credentialOAuth2ScopeResolver.resolveRequestedScopes(
        credentialType.definition.auth,
        instance.publicConfig,
      );
      return {
        status: "disconnected",
        providerId,
        scopes: [...requestedScopes],
      };
    }
    return {
      status: "connected",
      providerId: material.providerId,
      connectedEmail: material.connectedEmail,
      connectedAt: material.connectedAt,
      scopes: material.scopes,
      updatedAt: material.updatedAt,
    };
  }
}
