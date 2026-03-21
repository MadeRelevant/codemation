import { injectable } from "@codemation/core";


import type {
CredentialInstanceRecord,
CredentialOAuth2MaterialMetadata,
CredentialOAuth2MaterialRecord,
CredentialOAuth2StateRecord,
CredentialSecretMaterialRecord,
CredentialStore,
CredentialTestRecord,
} from "../../domain/credentials/CredentialServices";





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

export { PrismaCredentialStore } from "./PrismaCredentialStore";
