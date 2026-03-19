import { randomUUID, createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import type {
  CredentialBinding,
  CredentialBindingKey,
  CredentialFieldSchema,
  CredentialHealth,
  CredentialInstanceId,
  CredentialMaterialSourceKind,
  CredentialRequirement,
  CredentialSessionService,
  CredentialSetupStatus,
  CredentialTypeDefinition,
  CredentialTypeId,
  CredentialTypeRegistry,
  WorkflowDefinition,
  WorkflowRegistry,
} from "@codemation/core";
import { CoreTokens, CredentialUnboundError, inject, injectable } from "@codemation/core";
import { ApplicationRequestError } from "../../application/ApplicationRequestError";
import type {
  CreateCredentialInstanceRequest,
  CredentialInstanceDto,
  UpdateCredentialInstanceRequest,
  WorkflowCredentialHealthDto,
  WorkflowCredentialHealthSlotDto,
} from "../../application/contracts/CredentialContracts";
import { ApplicationTokens } from "../../applicationTokens";

type JsonRecord = Readonly<Record<string, unknown>>;

export type CredentialSecretRef = Readonly<
  | { kind: "db" }
  | {
      kind: "env";
      envByField: Readonly<Record<string, string>>;
    }
  | {
      kind: "code";
      value: JsonRecord;
    }
>;

export type CredentialInstanceRecord = Readonly<{
  instanceId: CredentialInstanceId;
  typeId: CredentialTypeId;
  displayName: string;
  sourceKind: CredentialMaterialSourceKind;
  publicConfig: JsonRecord;
  secretRef: CredentialSecretRef;
  tags: ReadonlyArray<string>;
  setupStatus: CredentialSetupStatus;
  createdAt: string;
  updatedAt: string;
}>;

export type CredentialSecretMaterialRecord = Readonly<{
  instanceId: CredentialInstanceId;
  encryptedJson: string;
  encryptionKeyId: string;
  schemaVersion: number;
  updatedAt: string;
}>;

export type CredentialTestRecord = Readonly<{
  testId: string;
  instanceId: CredentialInstanceId;
  health: CredentialHealth;
  testedAt: string;
  expiresAt?: string;
}>;

export interface CredentialStore {
  listInstances(): Promise<ReadonlyArray<CredentialInstanceRecord>>;
  getInstance(instanceId: CredentialInstanceId): Promise<CredentialInstanceRecord | undefined>;
  saveInstance(args: Readonly<{
    instance: CredentialInstanceRecord;
    secretMaterial?: CredentialSecretMaterialRecord;
  }>): Promise<void>;
  deleteInstance(instanceId: CredentialInstanceId): Promise<void>;
  getSecretMaterial(instanceId: CredentialInstanceId): Promise<CredentialSecretMaterialRecord | undefined>;
  upsertBinding(binding: CredentialBinding): Promise<void>;
  getBinding(key: CredentialBindingKey): Promise<CredentialBinding | undefined>;
  listBindingsByWorkflowId(workflowId: string): Promise<ReadonlyArray<CredentialBinding>>;
  saveTestResult(record: CredentialTestRecord): Promise<void>;
  getLatestTestResult(instanceId: CredentialInstanceId): Promise<CredentialTestRecord | undefined>;
  getLatestTestResults(instanceIds: ReadonlyArray<CredentialInstanceId>): Promise<ReadonlyMap<CredentialInstanceId, CredentialTestRecord>>;
}

export type CredentialSessionFactory = (args: Readonly<{
  instance: CredentialInstanceRecord;
  material: JsonRecord;
  publicConfig: JsonRecord;
}>) => Promise<unknown>;

export type CredentialHealthTester = (args: Readonly<{
  instance: CredentialInstanceRecord;
  material: JsonRecord;
  publicConfig: JsonRecord;
}>) => Promise<CredentialHealth>;

export type RegisteredCredentialType = Readonly<{
  definition: CredentialTypeDefinition;
  createSession: CredentialSessionFactory;
  test: CredentialHealthTester;
}>;

type MutableCredentialSessionService = CredentialSessionService & Readonly<{
  evictInstance(instanceId: CredentialInstanceId): void;
  evictBinding(bindingKey: CredentialBindingKey): void;
}>;

@injectable()
export class CredentialTypeRegistryImpl implements CredentialTypeRegistry {
  private readonly registeredTypesById = new Map<CredentialTypeId, RegisteredCredentialType>();

  register(type: RegisteredCredentialType): void {
    if (this.registeredTypesById.has(type.definition.typeId)) {
      throw new Error(`Credential type already registered: ${type.definition.typeId}`);
    }
    this.registeredTypesById.set(type.definition.typeId, type);
  }

  listTypes(): ReadonlyArray<CredentialTypeDefinition> {
    return [...this.registeredTypesById.values()].map((entry) => entry.definition);
  }

  getType(typeId: CredentialTypeId): CredentialTypeDefinition | undefined {
    return this.registeredTypesById.get(typeId)?.definition;
  }

  getRegisteredType(typeId: CredentialTypeId): RegisteredCredentialType | undefined {
    return this.registeredTypesById.get(typeId);
  }
}

@injectable()
export class CredentialSecretCipher {
  private static readonly algorithm = "aes-256-gcm";
  private static readonly schemaVersion = 1;
  private static readonly ivLength = 12;

  constructor(
    @inject(ApplicationTokens.ProcessEnv)
    private readonly env: Readonly<NodeJS.ProcessEnv>,
  ) {}

  encrypt(value: JsonRecord): Readonly<{
    encryptedJson: string;
    encryptionKeyId: string;
    schemaVersion: number;
  }> {
    const iv = randomBytes(CredentialSecretCipher.ivLength);
    const cipher = createCipheriv(CredentialSecretCipher.algorithm, this.resolveKeyMaterial(), iv);
    const plaintext = Buffer.from(JSON.stringify(value), "utf8");
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      encryptedJson: Buffer.concat([iv, authTag, encrypted]).toString("base64"),
      encryptionKeyId: this.resolveKeyId(),
      schemaVersion: CredentialSecretCipher.schemaVersion,
    };
  }

  decrypt(record: CredentialSecretMaterialRecord): JsonRecord {
    const packed = Buffer.from(record.encryptedJson, "base64");
    const iv = packed.subarray(0, CredentialSecretCipher.ivLength);
    const authTag = packed.subarray(CredentialSecretCipher.ivLength, CredentialSecretCipher.ivLength + 16);
    const encrypted = packed.subarray(CredentialSecretCipher.ivLength + 16);
    const decipher = createDecipheriv(CredentialSecretCipher.algorithm, this.resolveKeyMaterial(), iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
    return JSON.parse(plaintext) as JsonRecord;
  }

  private resolveKeyMaterial(): Buffer {
    const rawValue = this.env.CODEMATION_CREDENTIALS_MASTER_KEY;
    if (!rawValue || rawValue.trim().length === 0) {
      throw new Error("CODEMATION_CREDENTIALS_MASTER_KEY is required to encrypt database-managed credentials.");
    }
    return createHash("sha256").update(rawValue).digest();
  }

  private resolveKeyId(): string {
    const rawValue = this.env.CODEMATION_CREDENTIALS_MASTER_KEY;
    return createHash("sha256").update(rawValue ?? "").digest("hex").slice(0, 12);
  }
}

@injectable()
export class CredentialMaterialResolver {
  constructor(
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CredentialSecretCipher)
    private readonly credentialSecretCipher: CredentialSecretCipher,
    @inject(ApplicationTokens.ProcessEnv)
    private readonly env: Readonly<NodeJS.ProcessEnv>,
  ) {}

  async resolveMaterial(instance: CredentialInstanceRecord): Promise<JsonRecord> {
    if (instance.secretRef.kind === "db") {
      const secretMaterial = await this.credentialStore.getSecretMaterial(instance.instanceId);
      if (!secretMaterial) {
        throw new Error(`Credential ${instance.instanceId} is missing encrypted secret material.`);
      }
      return this.credentialSecretCipher.decrypt(secretMaterial);
    }
    if (instance.secretRef.kind === "env") {
      return this.resolveEnvMaterial(instance);
    }
    return instance.secretRef.value;
  }

  private resolveEnvMaterial(instance: CredentialInstanceRecord): JsonRecord {
    if (instance.secretRef.kind !== "env") {
      throw new Error(`Credential ${instance.instanceId} is not environment-backed.`);
    }
    const resolved: Record<string, unknown> = {};
    const missingEnvironmentVariables: string[] = [];
    for (const [fieldKey, envVarName] of Object.entries(instance.secretRef.envByField)) {
      const value = this.env[envVarName];
      if (value === undefined || value.length === 0) {
        missingEnvironmentVariables.push(envVarName);
        continue;
      }
      resolved[fieldKey] = value;
    }
    if (missingEnvironmentVariables.length > 0) {
      throw new Error(
        `Credential ${instance.instanceId} requires environment variables that are not set: ${missingEnvironmentVariables.join(", ")}.`,
      );
    }
    return resolved;
  }
}

@injectable()
export class CredentialInstanceService {
  constructor(
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CredentialTypeRegistryImpl)
    private readonly credentialTypeRegistry: CredentialTypeRegistryImpl,
    @inject(CredentialSecretCipher)
    private readonly credentialSecretCipher: CredentialSecretCipher,
    @inject(CoreTokens.CredentialSessionService)
    private readonly credentialSessionService: MutableCredentialSessionService,
  ) {}

  async listInstances(): Promise<ReadonlyArray<CredentialInstanceDto>> {
    const instances = await this.credentialStore.listInstances();
    const latestTestResults = await this.credentialStore.getLatestTestResults(instances.map((instance) => instance.instanceId));
    return instances.map((instance) => this.toDto(instance, latestTestResults.get(instance.instanceId)));
  }

  async getInstance(instanceId: CredentialInstanceId): Promise<CredentialInstanceDto | undefined> {
    const instance = await this.credentialStore.getInstance(instanceId);
    if (!instance) {
      return undefined;
    }
    const latestTestResult = await this.credentialStore.getLatestTestResult(instanceId);
    return this.toDto(instance, latestTestResult);
  }

  async create(request: CreateCredentialInstanceRequest): Promise<CredentialInstanceDto> {
    const registeredType = this.requireRegisteredType(request.typeId);
    this.validateRequestFields({
      displayName: request.displayName,
      publicFields: registeredType.definition.publicFields ?? [],
      publicConfig: request.publicConfig ?? {},
      secretFields: registeredType.definition.secretFields ?? [],
      sourceKind: request.sourceKind,
      secretConfig: request.secretConfig ?? {},
      envSecretRefs: request.envSecretRefs ?? {},
    });
    const timestamp = new Date().toISOString();
    const instance: CredentialInstanceRecord = {
      instanceId: randomUUID(),
      typeId: request.typeId,
      displayName: request.displayName.trim(),
      sourceKind: request.sourceKind,
      publicConfig: Object.freeze({ ...(request.publicConfig ?? {}) }),
      secretRef: this.createSecretRef(request.sourceKind, request.secretConfig ?? {}, request.envSecretRefs ?? {}),
      tags: Object.freeze([...(request.tags ?? [])]),
      setupStatus: "ready",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.credentialStore.saveInstance({
      instance,
      secretMaterial: this.createSecretMaterial(instance, request.secretConfig ?? {}, timestamp),
    });
    this.credentialSessionService.evictInstance(instance.instanceId);
    return this.toDto(instance, undefined);
  }

  async update(instanceId: CredentialInstanceId, request: UpdateCredentialInstanceRequest): Promise<CredentialInstanceDto> {
    const existing = await this.requireInstance(instanceId);
    const registeredType = this.requireRegisteredType(existing.typeId);
    const publicConfig = Object.freeze({ ...(request.publicConfig ?? existing.publicConfig) });
    const updatedAt = new Date().toISOString();
    const nextSecretConfig = request.secretConfig;
    const nextEnvSecretRefs = request.envSecretRefs;
    this.validateRequestFields({
      displayName: request.displayName ?? existing.displayName,
      publicFields: registeredType.definition.publicFields ?? [],
      publicConfig,
      secretFields: registeredType.definition.secretFields ?? [],
      sourceKind: existing.sourceKind,
      secretConfig: nextSecretConfig ?? {},
      envSecretRefs: nextEnvSecretRefs ?? {},
      allowSecretOmission: true,
    });
    const instance: CredentialInstanceRecord = {
      ...existing,
      displayName: request.displayName?.trim() || existing.displayName,
      publicConfig,
      tags: Object.freeze([...(request.tags ?? existing.tags)]),
      setupStatus: request.setupStatus ?? existing.setupStatus,
      secretRef:
        nextSecretConfig || nextEnvSecretRefs
          ? this.createSecretRef(existing.sourceKind, nextSecretConfig ?? {}, nextEnvSecretRefs ?? {})
          : existing.secretRef,
      updatedAt,
    };
    await this.credentialStore.saveInstance({
      instance,
      secretMaterial: nextSecretConfig ? this.createSecretMaterial(instance, nextSecretConfig, updatedAt) : undefined,
    });
    this.credentialSessionService.evictInstance(instance.instanceId);
    return this.toDto(instance, await this.credentialStore.getLatestTestResult(instance.instanceId));
  }

  async delete(instanceId: CredentialInstanceId): Promise<void> {
    await this.credentialStore.deleteInstance(instanceId);
    this.credentialSessionService.evictInstance(instanceId);
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

  private validateRequestFields(args: Readonly<{
    displayName: string;
    publicFields: ReadonlyArray<CredentialFieldSchema>;
    publicConfig: JsonRecord;
    secretFields: ReadonlyArray<CredentialFieldSchema>;
    sourceKind: CredentialMaterialSourceKind;
    secretConfig: JsonRecord;
    envSecretRefs: Readonly<Record<string, string>>;
    allowSecretOmission?: boolean;
  }>): void {
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

  private assertRequiredFields(
    fieldName: string,
    schema: ReadonlyArray<CredentialFieldSchema>,
    value: JsonRecord,
  ): void {
    const missing = schema
      .filter((field) => field.required === true)
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
      .filter((field) => !envSecretRefs[field.key] || envSecretRefs[field.key]!.trim().length === 0)
      .map((field) => field.key);
    if (missing.length > 0) {
      throw new ApplicationRequestError(400, `Missing required envSecretRefs field(s): ${missing.join(", ")}`);
    }
  }

  private requireRegisteredType(typeId: CredentialTypeId): RegisteredCredentialType {
    const registeredType = this.credentialTypeRegistry.getRegisteredType(typeId);
    if (!registeredType) {
      throw new ApplicationRequestError(400, `Unknown credential type: ${typeId}`);
    }
    return registeredType;
  }

  private toDto(instance: CredentialInstanceRecord, latestTestResult: CredentialTestRecord | undefined): CredentialInstanceDto {
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
    };
  }
}

@injectable()
export class CredentialBindingService {
  constructor(
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
    @inject(CoreTokens.WorkflowRegistry)
    private readonly workflowRegistry: WorkflowRegistry,
    @inject(CoreTokens.CredentialSessionService)
    private readonly credentialSessionService: MutableCredentialSessionService,
  ) {}

  async upsertBinding(args: Readonly<{ workflowId: string; nodeId: string; slotKey: string; instanceId: CredentialInstanceId }>): Promise<CredentialBinding> {
    const workflow = this.requireWorkflow(args.workflowId);
    const requirement = this.requireRequirement(workflow, args.nodeId, args.slotKey);
    const instance = await this.credentialInstanceService.requireInstance(args.instanceId);
    if (!requirement.acceptedTypes.includes(instance.typeId)) {
      throw new ApplicationRequestError(
        400,
        `Credential instance ${instance.instanceId} (${instance.typeId}) is not compatible with slot ${args.slotKey}. Accepted types: ${requirement.acceptedTypes.join(", ")}`,
      );
    }
    const binding: CredentialBinding = {
      key: {
        workflowId: args.workflowId,
        nodeId: args.nodeId,
        slotKey: args.slotKey,
      },
      instanceId: args.instanceId,
      updatedAt: new Date().toISOString(),
    };
    await this.credentialStore.upsertBinding(binding);
    this.credentialSessionService.evictBinding(binding.key);
    return binding;
  }

  async listWorkflowHealth(workflowId: string): Promise<WorkflowCredentialHealthDto> {
    const workflow = this.requireWorkflow(workflowId);
    const bindings = await this.credentialStore.listBindingsByWorkflowId(workflowId);
    const bindingsByKey = new Map(bindings.map((binding) => [this.toBindingKeyString(binding.key), binding] as const));
    const slots: WorkflowCredentialHealthSlotDto[] = [];
    for (const node of workflow.nodes) {
      const requirements = node.config.getCredentialRequirements?.() ?? [];
      for (const requirement of requirements) {
        const bindingKey = {
          workflowId,
          nodeId: node.id,
          slotKey: requirement.slotKey,
        } satisfies CredentialBindingKey;
        const binding = bindingsByKey.get(this.toBindingKeyString(bindingKey));
        if (!binding) {
          slots.push({
            workflowId,
            nodeId: node.id,
            nodeName: node.name ?? node.config.name,
            requirement,
            health: {
              status: requirement.optional ? "optional-unbound" : "unbound",
            },
          });
          continue;
        }
        const instance = await this.credentialInstanceService.requireInstance(binding.instanceId);
        const latestTestResult = await this.credentialStore.getLatestTestResult(instance.instanceId);
        slots.push({
          workflowId,
          nodeId: node.id,
          nodeName: node.name ?? node.config.name,
          requirement,
          instance: {
            instanceId: instance.instanceId,
            typeId: instance.typeId,
            displayName: instance.displayName,
            setupStatus: instance.setupStatus,
          },
          health: {
            status: latestTestResult?.health.status ?? "unknown",
            message: latestTestResult?.health.message,
            testedAt: latestTestResult?.health.testedAt,
          },
        });
      }
    }
    return {
      workflowId,
      slots,
    };
  }

  private requireWorkflow(workflowId: string): WorkflowDefinition {
    const workflow = this.workflowRegistry.get(decodeURIComponent(workflowId));
    if (!workflow) {
      throw new ApplicationRequestError(404, `Unknown workflowId: ${workflowId}`);
    }
    return workflow;
  }

  private requireRequirement(workflow: WorkflowDefinition, nodeId: string, slotKey: string): CredentialRequirement {
    const node = workflow.nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      throw new ApplicationRequestError(404, `Unknown workflow node: ${nodeId}`);
    }
    const requirement = (node.config.getCredentialRequirements?.() ?? []).find((entry) => entry.slotKey === slotKey);
    if (!requirement) {
      throw new ApplicationRequestError(400, `Node ${nodeId} does not declare credential slot ${slotKey}.`);
    }
    return requirement;
  }

  private toBindingKeyString(bindingKey: CredentialBindingKey): string {
    return `${bindingKey.workflowId}:${bindingKey.nodeId}:${bindingKey.slotKey}`;
  }
}

@injectable()
export class CredentialTestService {
  constructor(
    @inject(CredentialInstanceService)
    private readonly credentialInstanceService: CredentialInstanceService,
    @inject(CredentialMaterialResolver)
    private readonly credentialMaterialResolver: CredentialMaterialResolver,
    @inject(CredentialTypeRegistryImpl)
    private readonly credentialTypeRegistry: CredentialTypeRegistryImpl,
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CoreTokens.CredentialSessionService)
    private readonly credentialSessionService: MutableCredentialSessionService,
  ) {}

  async test(instanceId: CredentialInstanceId): Promise<CredentialHealth> {
    const instance = await this.credentialInstanceService.requireInstance(instanceId);
    const registeredType = this.requireRegisteredType(instance.typeId);
    const material = await this.credentialMaterialResolver.resolveMaterial(instance);
    const health = await registeredType.test({
      instance,
      material,
      publicConfig: instance.publicConfig,
    });
    const testedAt = health.testedAt ?? new Date().toISOString();
    await this.credentialStore.saveTestResult({
      testId: randomUUID(),
      instanceId,
      health: {
        ...health,
        testedAt,
      },
      testedAt,
      expiresAt: health.expiresAt,
    });
    this.credentialSessionService.evictInstance(instanceId);
    return {
      ...health,
      testedAt,
    };
  }

  private requireRegisteredType(typeId: CredentialTypeId): RegisteredCredentialType {
    const registeredType = this.credentialTypeRegistry.getRegisteredType(typeId);
    if (!registeredType) {
      throw new ApplicationRequestError(400, `Unknown credential type: ${typeId}`);
    }
    return registeredType;
  }
}

@injectable()
export class CredentialSessionServiceImpl implements CredentialSessionService {
  private readonly cachedSessionsByInstanceId = new Map<CredentialInstanceId, Promise<unknown>>();
  private readonly cachedInstanceIdsByBindingKey = new Map<string, CredentialInstanceId>();

  constructor(
    @inject(ApplicationTokens.CredentialStore)
    private readonly credentialStore: CredentialStore,
    @inject(CredentialMaterialResolver)
    private readonly credentialMaterialResolver: CredentialMaterialResolver,
    @inject(CredentialTypeRegistryImpl)
    private readonly credentialTypeRegistry: CredentialTypeRegistryImpl,
    @inject(CoreTokens.WorkflowRegistry)
    private readonly workflowRegistry: WorkflowRegistry,
  ) {}

  async getSession<TSession = unknown>(args: Readonly<{ workflowId: string; nodeId: string; slotKey: string }>): Promise<TSession> {
    const workflow = this.workflowRegistry.get(decodeURIComponent(args.workflowId));
    const requirement = workflow?.nodes
      .find((node) => node.id === args.nodeId)
      ?.config.getCredentialRequirements?.()
      .find((entry) => entry.slotKey === args.slotKey);
    const bindingKey: CredentialBindingKey = {
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      slotKey: args.slotKey,
    };
    const binding = await this.credentialStore.getBinding(bindingKey);
    if (!binding) {
      throw new CredentialUnboundError(bindingKey, requirement?.acceptedTypes ?? []);
    }
    const bindingCacheKey = this.toBindingKeyString(bindingKey);
    this.cachedInstanceIdsByBindingKey.set(bindingCacheKey, binding.instanceId);
    const cachedSession = this.cachedSessionsByInstanceId.get(binding.instanceId);
    if (cachedSession) {
      return (await cachedSession) as TSession;
    }
    const nextSessionPromise = this.createSession(binding.instanceId).catch((error) => {
      this.cachedSessionsByInstanceId.delete(binding.instanceId);
      throw error;
    });
    this.cachedSessionsByInstanceId.set(binding.instanceId, nextSessionPromise);
    return (await nextSessionPromise) as TSession;
  }

  evictInstance(instanceId: CredentialInstanceId): void {
    this.cachedSessionsByInstanceId.delete(instanceId);
  }

  evictBinding(bindingKey: CredentialBindingKey): void {
    const cacheKey = this.toBindingKeyString(bindingKey);
    const instanceId = this.cachedInstanceIdsByBindingKey.get(cacheKey);
    if (instanceId) {
      this.cachedSessionsByInstanceId.delete(instanceId);
    }
    this.cachedInstanceIdsByBindingKey.delete(cacheKey);
  }

  private async createSession(instanceId: CredentialInstanceId): Promise<unknown> {
    const instance = await this.credentialStore.getInstance(instanceId);
    if (!instance) {
      throw new ApplicationRequestError(404, `Unknown credential instance: ${instanceId}`);
    }
    const registeredType = this.credentialTypeRegistry.getRegisteredType(instance.typeId);
    if (!registeredType) {
      throw new ApplicationRequestError(400, `Unknown credential type: ${instance.typeId}`);
    }
    const material = await this.credentialMaterialResolver.resolveMaterial(instance);
    return await registeredType.createSession({
      instance,
      material,
      publicConfig: instance.publicConfig,
    });
  }

  private toBindingKeyString(bindingKey: CredentialBindingKey): string {
    return `${bindingKey.workflowId}:${bindingKey.nodeId}:${bindingKey.slotKey}`;
  }
}
