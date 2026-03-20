

import type {
CredentialBinding,
CredentialBindingKey,
CredentialHealth,
CredentialInstanceId,
CredentialMaterialSourceKind,
CredentialSessionService,
CredentialSetupStatus,
CredentialTypeDefinition,
CredentialTypeId,
CredentialTypeRegistry
} from "@codemation/core";


import { injectable } from "@codemation/core";









export type JsonRecord = Readonly<Record<string, unknown>>;



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



export type CredentialOAuth2MaterialMetadata = Readonly<{
  providerId: string;
  connectedEmail?: string;
  connectedAt?: string;
  scopes: ReadonlyArray<string>;
  updatedAt: string;
}>;



export type CredentialOAuth2MaterialRecord = Readonly<
  {
    instanceId: CredentialInstanceId;
  } & CredentialSecretMaterialRecord &
    CredentialOAuth2MaterialMetadata
>;



export type CredentialOAuth2StateRecord = Readonly<{
  state: string;
  instanceId: CredentialInstanceId;
  codeVerifier?: string;
  providerId?: string;
  requestedScopes: ReadonlyArray<string>;
  createdAt: string;
  expiresAt: string;
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
  createOAuth2State(record: CredentialOAuth2StateRecord): Promise<void>;
  consumeOAuth2State(state: string): Promise<CredentialOAuth2StateRecord | undefined>;
  getOAuth2Material(instanceId: CredentialInstanceId): Promise<CredentialOAuth2MaterialRecord | undefined>;
  saveOAuth2Material(args: Readonly<{
    instanceId: CredentialInstanceId;
    encryptedJson: string;
    encryptionKeyId: string;
    schemaVersion: number;
    metadata: CredentialOAuth2MaterialMetadata;
  }>): Promise<void>;
  deleteOAuth2Material(instanceId: CredentialInstanceId): Promise<void>;
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



export type MutableCredentialSessionService = CredentialSessionService & Readonly<{
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

export { CredentialBindingService } from "./CredentialBindingService";
export { CredentialInstanceService } from "./CredentialInstanceService";
export { CredentialMaterialResolver } from "./CredentialMaterialResolver";
export { CredentialRuntimeMaterialService } from "./CredentialRuntimeMaterialService";
export { CredentialSecretCipher } from "./CredentialSecretCipher";
export { CredentialSessionServiceImpl } from "./CredentialSessionServiceImpl";
export { CredentialTestService } from "./CredentialTestService";
