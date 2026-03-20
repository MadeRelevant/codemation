import type {
CredentialHealth,
CredentialInstanceId,
CredentialMaterialSourceKind,
CredentialRequirement,
CredentialSetupStatus,
CredentialTypeDefinition,
CredentialTypeId,
} from "@codemation/core";

export type CredentialInstanceDto = Readonly<{
  instanceId: CredentialInstanceId;
  typeId: CredentialTypeId;
  displayName: string;
  sourceKind: CredentialMaterialSourceKind;
  publicConfig: Readonly<Record<string, unknown>>;
  tags: ReadonlyArray<string>;
  setupStatus: CredentialSetupStatus;
  createdAt: string;
  updatedAt: string;
  latestHealth?: CredentialHealth;
  oauth2Connection?: CredentialOAuth2ConnectionDto;
}>;

export type CredentialOAuth2ConnectionDto = Readonly<{
  status: "connected" | "disconnected";
  providerId: string;
  connectedEmail?: string;
  connectedAt?: string;
  scopes: ReadonlyArray<string>;
  updatedAt?: string;
}>;

export type CredentialInstanceWithSecretsDto = CredentialInstanceDto &
  Readonly<{
    secretConfig?: Readonly<Record<string, string>>;
    envSecretRefs?: Readonly<Record<string, string>>;
  }>;

export type WorkflowCredentialHealthSlotDto = Readonly<{
  workflowId: string;
  nodeId: string;
  nodeName?: string;
  requirement: CredentialRequirement;
  instance?: Pick<CredentialInstanceDto, "instanceId" | "typeId" | "displayName" | "setupStatus">;
  health: Readonly<{
    status: "unbound" | "optional-unbound" | "unknown" | "healthy" | "failing";
    message?: string;
    testedAt?: string;
  }>;
}>;

export type WorkflowCredentialHealthDto = Readonly<{
  workflowId: string;
  slots: ReadonlyArray<WorkflowCredentialHealthSlotDto>;
}>;

export type CreateCredentialInstanceRequest = Readonly<{
  typeId: CredentialTypeId;
  displayName: string;
  sourceKind: CredentialMaterialSourceKind;
  publicConfig?: Readonly<Record<string, unknown>>;
  secretConfig?: Readonly<Record<string, unknown>>;
  envSecretRefs?: Readonly<Record<string, string>>;
  tags?: ReadonlyArray<string>;
}>;

export type UpdateCredentialInstanceRequest = Readonly<{
  displayName?: string;
  publicConfig?: Readonly<Record<string, unknown>>;
  secretConfig?: Readonly<Record<string, unknown>>;
  envSecretRefs?: Readonly<Record<string, string>>;
  tags?: ReadonlyArray<string>;
  setupStatus?: CredentialSetupStatus;
}>;

export type UpsertCredentialBindingRequest = Readonly<{
  workflowId: string;
  nodeId: string;
  slotKey: string;
  instanceId: CredentialInstanceId;
}>;

export class CredentialResponseMapper {
  static toTypeDefinitionList(types: ReadonlyArray<CredentialTypeDefinition>): ReadonlyArray<CredentialTypeDefinition> {
    return [...types];
  }
}
