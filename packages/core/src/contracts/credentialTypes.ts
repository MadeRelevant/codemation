import type { NodeId, WorkflowId } from "./workflowTypes";

export type CredentialTypeId = string;
export type CredentialInstanceId = string;

export type CredentialMaterialSourceKind = "db" | "env" | "code";
export type CredentialSetupStatus = "draft" | "ready";
export type CredentialHealthStatus = "unknown" | "healthy" | "failing";

export type CredentialFieldSchema = Readonly<{
  key: string;
  label: string;
  type: "string" | "password" | "textarea" | "json" | "boolean";
  required?: true;
  placeholder?: string;
  helpText?: string;
}>;

export type CredentialRequirement = Readonly<{
  slotKey: string;
  label: string;
  acceptedTypes: ReadonlyArray<CredentialTypeId>;
  optional?: true;
  helpText?: string;
  helpUrl?: string;
}>;

export type CredentialBindingKey = Readonly<{
  workflowId: WorkflowId;
  nodeId: NodeId;
  slotKey: string;
}>;

export type CredentialBinding = Readonly<{
  key: CredentialBindingKey;
  instanceId: CredentialInstanceId;
  updatedAt: string;
}>;

export type CredentialHealth = Readonly<{
  status: CredentialHealthStatus;
  message?: string;
  testedAt?: string;
  expiresAt?: string;
  details?: Readonly<Record<string, unknown>>;
}>;

export type CredentialTypeDefinition = Readonly<{
  typeId: CredentialTypeId;
  displayName: string;
  description?: string;
  publicFields?: ReadonlyArray<CredentialFieldSchema>;
  secretFields?: ReadonlyArray<CredentialFieldSchema>;
  supportedSourceKinds?: ReadonlyArray<CredentialMaterialSourceKind>;
}>;

export interface CredentialSessionService {
  getSession<TSession = unknown>(args: Readonly<{
    workflowId: WorkflowId;
    nodeId: NodeId;
    slotKey: string;
  }>): Promise<TSession>;
}

export interface CredentialTypeRegistry {
  listTypes(): ReadonlyArray<CredentialTypeDefinition>;
  getType(typeId: CredentialTypeId): CredentialTypeDefinition | undefined;
}

export class CredentialUnboundError extends Error {
  constructor(
    public readonly bindingKey: CredentialBindingKey,
    public readonly acceptedTypes: ReadonlyArray<CredentialTypeId> = [],
  ) {
    super(CredentialUnboundError.createMessage(bindingKey, acceptedTypes));
    this.name = "CredentialUnboundError";
  }

  private static createMessage(
    bindingKey: CredentialBindingKey,
    acceptedTypes: ReadonlyArray<CredentialTypeId>,
  ): string {
    const acceptedTypesSuffix =
      acceptedTypes.length > 0 ? ` Accepted credential types: ${acceptedTypes.join(", ")}.` : "";
    return `Credential slot "${bindingKey.slotKey}" is not bound for workflow ${bindingKey.workflowId} node ${bindingKey.nodeId}.${acceptedTypesSuffix}`;
  }
}
