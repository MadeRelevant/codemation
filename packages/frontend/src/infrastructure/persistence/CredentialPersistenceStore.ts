import { inject, injectable } from "@codemation/core";
import type {
  CredentialInstanceRecord,
  CredentialOAuth2MaterialMetadata,
  CredentialOAuth2MaterialRecord,
  CredentialOAuth2StateRecord,
  CredentialSecretMaterialRecord,
  CredentialStore,
  CredentialTestRecord,
} from "../../domain/credentials/CredentialServices";
import { PrismaClient } from "./generated/prisma-client/client.js";

@injectable()
export class InMemoryCredentialStore implements CredentialStore {
  private readonly instancesById = new Map<string, CredentialInstanceRecord>();
  private readonly secretsByInstanceId = new Map<string, CredentialSecretMaterialRecord>();
  private readonly oauth2MaterialsByInstanceId = new Map<string, CredentialOAuth2MaterialRecord>();
  private readonly oauth2StatesByState = new Map<string, CredentialOAuth2StateRecord>();
  private readonly bindingsByKey = new Map<string, import("@codemation/core").CredentialBinding>();
  private readonly testRecordsByInstanceId = new Map<string, CredentialTestRecord>();

  async listInstances(): Promise<ReadonlyArray<CredentialInstanceRecord>> {
    return [...this.instancesById.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getInstance(instanceId: string): Promise<CredentialInstanceRecord | undefined> {
    return this.instancesById.get(instanceId);
  }

  async saveInstance(args: Readonly<{ instance: CredentialInstanceRecord; secretMaterial?: CredentialSecretMaterialRecord }>): Promise<void> {
    this.instancesById.set(args.instance.instanceId, args.instance);
    if (args.secretMaterial) {
      this.secretsByInstanceId.set(args.instance.instanceId, args.secretMaterial);
    }
  }

  async deleteInstance(instanceId: string): Promise<void> {
    this.instancesById.delete(instanceId);
    this.secretsByInstanceId.delete(instanceId);
    this.oauth2MaterialsByInstanceId.delete(instanceId);
    this.testRecordsByInstanceId.delete(instanceId);
    for (const [state, record] of this.oauth2StatesByState.entries()) {
      if (record.instanceId === instanceId) {
        this.oauth2StatesByState.delete(state);
      }
    }
    for (const [key, binding] of this.bindingsByKey.entries()) {
      if (binding.instanceId === instanceId) {
        this.bindingsByKey.delete(key);
      }
    }
  }

  async getSecretMaterial(instanceId: string): Promise<CredentialSecretMaterialRecord | undefined> {
    return this.secretsByInstanceId.get(instanceId);
  }

  async createOAuth2State(record: CredentialOAuth2StateRecord): Promise<void> {
    this.oauth2StatesByState.set(record.state, record);
  }

  async consumeOAuth2State(state: string): Promise<CredentialOAuth2StateRecord | undefined> {
    const record = this.oauth2StatesByState.get(state);
    if (!record) {
      return undefined;
    }
    this.oauth2StatesByState.delete(state);
    return record;
  }

  async getOAuth2Material(instanceId: string): Promise<CredentialOAuth2MaterialRecord | undefined> {
    return this.oauth2MaterialsByInstanceId.get(instanceId);
  }

  async saveOAuth2Material(args: Readonly<{
    instanceId: string;
    encryptedJson: string;
    encryptionKeyId: string;
    schemaVersion: number;
    metadata: CredentialOAuth2MaterialMetadata;
  }>): Promise<void> {
    this.oauth2MaterialsByInstanceId.set(args.instanceId, {
      instanceId: args.instanceId,
      encryptedJson: args.encryptedJson,
      encryptionKeyId: args.encryptionKeyId,
      schemaVersion: args.schemaVersion,
      providerId: args.metadata.providerId,
      connectedEmail: args.metadata.connectedEmail,
      connectedAt: args.metadata.connectedAt,
      scopes: args.metadata.scopes,
      updatedAt: args.metadata.updatedAt,
    });
  }

  async deleteOAuth2Material(instanceId: string): Promise<void> {
    this.oauth2MaterialsByInstanceId.delete(instanceId);
  }

  async upsertBinding(binding: import("@codemation/core").CredentialBinding): Promise<void> {
    this.bindingsByKey.set(this.toBindingKey(binding.key), binding);
  }

  async getBinding(key: import("@codemation/core").CredentialBindingKey): Promise<import("@codemation/core").CredentialBinding | undefined> {
    return this.bindingsByKey.get(this.toBindingKey(key));
  }

  async listBindingsByWorkflowId(workflowId: string): Promise<ReadonlyArray<import("@codemation/core").CredentialBinding>> {
    return [...this.bindingsByKey.values()].filter((binding) => binding.key.workflowId === workflowId);
  }

  async saveTestResult(record: CredentialTestRecord): Promise<void> {
    this.testRecordsByInstanceId.set(record.instanceId, record);
  }

  async getLatestTestResult(instanceId: string): Promise<CredentialTestRecord | undefined> {
    return this.testRecordsByInstanceId.get(instanceId);
  }

  async getLatestTestResults(instanceIds: ReadonlyArray<string>): Promise<ReadonlyMap<string, CredentialTestRecord>> {
    const entries = instanceIds
      .map((instanceId) => [instanceId, this.testRecordsByInstanceId.get(instanceId)] as const)
      .filter((entry): entry is readonly [string, CredentialTestRecord] => entry[1] !== undefined);
    return new Map(entries);
  }

  private toBindingKey(key: import("@codemation/core").CredentialBindingKey): string {
    return `${key.workflowId}:${key.nodeId}:${key.slotKey}`;
  }
}

@injectable()
export class PrismaCredentialStore implements CredentialStore {
  constructor(@inject(PrismaClient) private readonly prisma: PrismaClient) {}

  async listInstances(): Promise<ReadonlyArray<CredentialInstanceRecord>> {
    const rows = await this.prisma.credentialInstance.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return rows.map((row) => this.toInstanceRecord(row));
  }

  async getInstance(instanceId: string): Promise<CredentialInstanceRecord | undefined> {
    const row = await this.prisma.credentialInstance.findUnique({
      where: { instanceId },
    });
    return row ? this.toInstanceRecord(row) : undefined;
  }

  async saveInstance(args: Readonly<{ instance: CredentialInstanceRecord; secretMaterial?: CredentialSecretMaterialRecord }>): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.credentialInstance.upsert({
        where: { instanceId: args.instance.instanceId },
        create: {
          instanceId: args.instance.instanceId,
          typeId: args.instance.typeId,
          displayName: args.instance.displayName,
          sourceKind: args.instance.sourceKind,
          publicConfigJson: JSON.stringify(args.instance.publicConfig),
          secretRefJson: JSON.stringify(args.instance.secretRef),
          tagsJson: JSON.stringify(args.instance.tags),
          setupStatus: args.instance.setupStatus,
          createdAt: args.instance.createdAt,
          updatedAt: args.instance.updatedAt,
        },
        update: {
          typeId: args.instance.typeId,
          displayName: args.instance.displayName,
          sourceKind: args.instance.sourceKind,
          publicConfigJson: JSON.stringify(args.instance.publicConfig),
          secretRefJson: JSON.stringify(args.instance.secretRef),
          tagsJson: JSON.stringify(args.instance.tags),
          setupStatus: args.instance.setupStatus,
          updatedAt: args.instance.updatedAt,
        },
      });
      if (args.secretMaterial) {
        await transaction.credentialSecretMaterial.upsert({
          where: { instanceId: args.secretMaterial.instanceId },
          create: {
            instanceId: args.secretMaterial.instanceId,
            encryptedJson: args.secretMaterial.encryptedJson,
            encryptionKeyId: args.secretMaterial.encryptionKeyId,
            schemaVersion: args.secretMaterial.schemaVersion,
            updatedAt: args.secretMaterial.updatedAt,
          },
          update: {
            encryptedJson: args.secretMaterial.encryptedJson,
            encryptionKeyId: args.secretMaterial.encryptionKeyId,
            schemaVersion: args.secretMaterial.schemaVersion,
            updatedAt: args.secretMaterial.updatedAt,
          },
        });
      }
    });
  }

  async deleteInstance(instanceId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.credentialOAuth2State.deleteMany({ where: { instanceId } });
      await transaction.credentialOAuth2Material.deleteMany({ where: { instanceId } });
      await transaction.credentialTestResult.deleteMany({ where: { instanceId } });
      await transaction.credentialBinding.deleteMany({ where: { instanceId } });
      await transaction.credentialSecretMaterial.deleteMany({ where: { instanceId } });
      await transaction.credentialInstance.deleteMany({ where: { instanceId } });
    });
  }

  async getSecretMaterial(instanceId: string): Promise<CredentialSecretMaterialRecord | undefined> {
    const row = await this.prisma.credentialSecretMaterial.findUnique({
      where: { instanceId },
    });
    return row
      ? {
          instanceId: row.instanceId,
          encryptedJson: row.encryptedJson,
          encryptionKeyId: row.encryptionKeyId,
          schemaVersion: row.schemaVersion,
          updatedAt: row.updatedAt,
        }
      : undefined;
  }

  async createOAuth2State(record: CredentialOAuth2StateRecord): Promise<void> {
    await this.prisma.credentialOAuth2State.create({
      data: {
        state: record.state,
        instanceId: record.instanceId,
        codeVerifier: record.codeVerifier ?? null,
        providerId: record.providerId ?? null,
        requestedScopesJson: JSON.stringify(record.requestedScopes),
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
      },
    });
  }

  async consumeOAuth2State(state: string): Promise<CredentialOAuth2StateRecord | undefined> {
    return await this.prisma.$transaction(async (transaction) => {
      const row = await transaction.credentialOAuth2State.findUnique({
        where: { state },
      });
      if (!row) {
        return undefined;
      }
      await transaction.credentialOAuth2State.delete({
        where: { state },
      });
      return {
        state: row.state,
        instanceId: row.instanceId,
        codeVerifier: row.codeVerifier ?? undefined,
        providerId: row.providerId ?? undefined,
        requestedScopes: JSON.parse(row.requestedScopesJson) as ReadonlyArray<string>,
        createdAt: row.createdAt,
        expiresAt: row.expiresAt,
      };
    });
  }

  async getOAuth2Material(instanceId: string): Promise<CredentialOAuth2MaterialRecord | undefined> {
    const row = await this.prisma.credentialOAuth2Material.findUnique({
      where: { instanceId },
    });
    return row
      ? {
          instanceId: row.instanceId,
          encryptedJson: row.encryptedJson,
          encryptionKeyId: row.encryptionKeyId,
          schemaVersion: row.schemaVersion,
          providerId: row.providerId,
          connectedEmail: row.connectedEmail ?? undefined,
          connectedAt: row.connectedAt ?? undefined,
          scopes: JSON.parse(row.scopesJson) as ReadonlyArray<string>,
          updatedAt: row.updatedAt,
        }
      : undefined;
  }

  async saveOAuth2Material(args: Readonly<{
    instanceId: string;
    encryptedJson: string;
    encryptionKeyId: string;
    schemaVersion: number;
    metadata: CredentialOAuth2MaterialMetadata;
  }>): Promise<void> {
    await this.prisma.credentialOAuth2Material.upsert({
      where: { instanceId: args.instanceId },
      create: {
        instanceId: args.instanceId,
        encryptedJson: args.encryptedJson,
        encryptionKeyId: args.encryptionKeyId,
        schemaVersion: args.schemaVersion,
        providerId: args.metadata.providerId,
        connectedEmail: args.metadata.connectedEmail ?? null,
        connectedAt: args.metadata.connectedAt ?? null,
        scopesJson: JSON.stringify(args.metadata.scopes),
        updatedAt: args.metadata.updatedAt,
      },
      update: {
        encryptedJson: args.encryptedJson,
        encryptionKeyId: args.encryptionKeyId,
        schemaVersion: args.schemaVersion,
        providerId: args.metadata.providerId,
        connectedEmail: args.metadata.connectedEmail ?? null,
        connectedAt: args.metadata.connectedAt ?? null,
        scopesJson: JSON.stringify(args.metadata.scopes),
        updatedAt: args.metadata.updatedAt,
      },
    });
  }

  async deleteOAuth2Material(instanceId: string): Promise<void> {
    await this.prisma.credentialOAuth2Material.deleteMany({
      where: { instanceId },
    });
  }

  async upsertBinding(binding: import("@codemation/core").CredentialBinding): Promise<void> {
    await this.prisma.credentialBinding.upsert({
      where: {
        workflowId_nodeId_slotKey: {
          workflowId: binding.key.workflowId,
          nodeId: binding.key.nodeId,
          slotKey: binding.key.slotKey,
        },
      },
      create: {
        workflowId: binding.key.workflowId,
        nodeId: binding.key.nodeId,
        slotKey: binding.key.slotKey,
        instanceId: binding.instanceId,
        updatedAt: binding.updatedAt,
      },
      update: {
        instanceId: binding.instanceId,
        updatedAt: binding.updatedAt,
      },
    });
  }

  async getBinding(key: import("@codemation/core").CredentialBindingKey): Promise<import("@codemation/core").CredentialBinding | undefined> {
    const row = await this.prisma.credentialBinding.findUnique({
      where: {
        workflowId_nodeId_slotKey: {
          workflowId: key.workflowId,
          nodeId: key.nodeId,
          slotKey: key.slotKey,
        },
      },
    });
    return row
      ? {
          key: {
            workflowId: row.workflowId,
            nodeId: row.nodeId,
            slotKey: row.slotKey,
          },
          instanceId: row.instanceId,
          updatedAt: row.updatedAt,
        }
      : undefined;
  }

  async listBindingsByWorkflowId(workflowId: string): Promise<ReadonlyArray<import("@codemation/core").CredentialBinding>> {
    const rows = await this.prisma.credentialBinding.findMany({
      where: { workflowId },
    });
    return rows.map((row) => ({
      key: {
        workflowId: row.workflowId,
        nodeId: row.nodeId,
        slotKey: row.slotKey,
      },
      instanceId: row.instanceId,
      updatedAt: row.updatedAt,
    }));
  }

  async saveTestResult(record: CredentialTestRecord): Promise<void> {
    await this.prisma.credentialTestResult.create({
      data: {
        testId: record.testId,
        instanceId: record.instanceId,
        status: record.health.status,
        message: record.health.message ?? null,
        detailsJson: JSON.stringify(record.health.details ?? {}),
        testedAt: record.testedAt,
        expiresAt: record.expiresAt ?? null,
      },
    });
  }

  async getLatestTestResult(instanceId: string): Promise<CredentialTestRecord | undefined> {
    const row = await this.prisma.credentialTestResult.findFirst({
      where: { instanceId },
      orderBy: { testedAt: "desc" },
    });
    return row ? this.toTestRecord(row) : undefined;
  }

  async getLatestTestResults(instanceIds: ReadonlyArray<string>): Promise<ReadonlyMap<string, CredentialTestRecord>> {
    if (instanceIds.length === 0) {
      return new Map();
    }
    const rows = await this.prisma.credentialTestResult.findMany({
      where: {
        instanceId: {
          in: [...instanceIds],
        },
      },
      orderBy: [{ instanceId: "asc" }, { testedAt: "desc" }],
    });
    const latestByInstanceId = new Map<string, CredentialTestRecord>();
    for (const row of rows) {
      if (latestByInstanceId.has(row.instanceId)) {
        continue;
      }
      latestByInstanceId.set(row.instanceId, this.toTestRecord(row));
    }
    return latestByInstanceId;
  }

  private toInstanceRecord(row: Readonly<{
    instanceId: string;
    typeId: string;
    displayName: string;
    sourceKind: string;
    publicConfigJson: string;
    secretRefJson: string;
    tagsJson: string;
    setupStatus: string;
    createdAt: string;
    updatedAt: string;
  }>): CredentialInstanceRecord {
    return {
      instanceId: row.instanceId,
      typeId: row.typeId,
      displayName: row.displayName,
      sourceKind: row.sourceKind as CredentialInstanceRecord["sourceKind"],
      publicConfig: JSON.parse(row.publicConfigJson) as CredentialInstanceRecord["publicConfig"],
      secretRef: JSON.parse(row.secretRefJson) as CredentialInstanceRecord["secretRef"],
      tags: JSON.parse(row.tagsJson) as CredentialInstanceRecord["tags"],
      setupStatus: row.setupStatus as CredentialInstanceRecord["setupStatus"],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private toTestRecord(row: Readonly<{
    testId: string;
    instanceId: string;
    status: string;
    message: string | null;
    detailsJson: string;
    testedAt: string;
    expiresAt: string | null;
  }>): CredentialTestRecord {
    return {
      testId: row.testId,
      instanceId: row.instanceId,
      health: {
        status: row.status as CredentialTestRecord["health"]["status"],
        message: row.message ?? undefined,
        testedAt: row.testedAt,
        expiresAt: row.expiresAt ?? undefined,
        details: JSON.parse(row.detailsJson) as CredentialTestRecord["health"]["details"],
      },
      testedAt: row.testedAt,
      expiresAt: row.expiresAt ?? undefined,
    };
  }
}
