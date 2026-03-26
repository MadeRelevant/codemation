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
  order?: number;
  placeholder?: string;
  helpText?: string;
  /** When set, host resolves this field from process.env at runtime; env wins over stored values. */
  envVarName?: string;
  /**
   * When set, the dialog shows a copy action for this exact string (e.g. a static OAuth redirect URI
   * pattern or documentation URL). Do not use for secret values.
   */
  copyValue?: string;
  /** Accessible label for the copy control (default: Copy). */
  copyButtonLabel?: string;
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

export type OAuth2ProviderFromPublicConfig = Readonly<{
  authorizeUrlFieldKey: string;
  tokenUrlFieldKey: string;
  userInfoUrlFieldKey?: string;
}>;

export type CredentialOAuth2AuthDefinition = Readonly<
  | {
      kind: "oauth2";
      providerId: string;
      scopes: ReadonlyArray<string>;
      clientIdFieldKey?: string;
      clientSecretFieldKey?: string;
    }
  | {
      kind: "oauth2";
      providerFromPublicConfig: OAuth2ProviderFromPublicConfig;
      scopes: ReadonlyArray<string>;
      clientIdFieldKey?: string;
      clientSecretFieldKey?: string;
    }
>;

export type CredentialAuthDefinition = CredentialOAuth2AuthDefinition;

export type CredentialTypeDefinition = Readonly<{
  typeId: CredentialTypeId;
  displayName: string;
  description?: string;
  publicFields?: ReadonlyArray<CredentialFieldSchema>;
  secretFields?: ReadonlyArray<CredentialFieldSchema>;
  supportedSourceKinds?: ReadonlyArray<CredentialMaterialSourceKind>;
  auth?: CredentialAuthDefinition;
}>;

/**
 * JSON-shaped credential field bag (public config, resolved secret material, etc.).
 */
export type CredentialJsonRecord = Readonly<Record<string, unknown>>;

/**
 * Persisted credential instance with typed `publicConfig`.
 * Hosts may specialize `secretRef` with a stricter union while remaining
 * assignable here for session/test callbacks.
 */
export type CredentialInstanceRecord<TPublicConfig extends CredentialJsonRecord = CredentialJsonRecord> = Readonly<{
  instanceId: CredentialInstanceId;
  typeId: CredentialTypeId;
  displayName: string;
  sourceKind: CredentialMaterialSourceKind;
  publicConfig: TPublicConfig;
  secretRef: CredentialJsonRecord;
  tags: ReadonlyArray<string>;
  setupStatus: CredentialSetupStatus;
  createdAt: string;
  updatedAt: string;
}>;

/**
 * Arguments passed to `CredentialType.createSession` and `CredentialType.test`.
 * Declare `TPublicConfig` / `TMaterial` on `CredentialType` so implementations are checked
 * against your credential shapes (similar to `NodeExecutionContext.config` for nodes).
 */
export type CredentialSessionFactoryArgs<
  TPublicConfig extends CredentialJsonRecord = CredentialJsonRecord,
  TMaterial extends CredentialJsonRecord = CredentialJsonRecord,
> = Readonly<{
  instance: CredentialInstanceRecord<TPublicConfig>;
  material: TMaterial;
  publicConfig: TPublicConfig;
}>;

export type CredentialSessionFactory<
  TPublicConfig extends CredentialJsonRecord = CredentialJsonRecord,
  TMaterial extends CredentialJsonRecord = CredentialJsonRecord,
  TSession = unknown,
> = (args: CredentialSessionFactoryArgs<TPublicConfig, TMaterial>) => Promise<TSession>;

export type CredentialHealthTester<
  TPublicConfig extends CredentialJsonRecord = CredentialJsonRecord,
  TMaterial extends CredentialJsonRecord = CredentialJsonRecord,
> = (args: CredentialSessionFactoryArgs<TPublicConfig, TMaterial>) => Promise<CredentialHealth>;

/**
 * Full credential type implementation: `definition` (UI/schema), `createSession`, and `test`.
 * Use this at registration and config boundaries; `CredentialTypeDefinition` is only the schema slice.
 */
export type CredentialType<
  TPublicConfig extends CredentialJsonRecord = CredentialJsonRecord,
  TMaterial extends CredentialJsonRecord = CredentialJsonRecord,
  TSession = unknown,
> = Readonly<{
  definition: CredentialTypeDefinition;
  createSession: CredentialSessionFactory<TPublicConfig, TMaterial, TSession>;
  test: CredentialHealthTester<TPublicConfig, TMaterial>;
}>;

/**
 * Credential type with unspecified generics — used for `CodemationConfig.credentialTypes`, the host registry,
 * and anywhere a concrete `CredentialType<YourPublic, YourMaterial, YourSession>` is placed in a heterogeneous list.
 * Using `any` here avoids unsafe `as` casts while keeping typed `satisfies CredentialType<…>` definitions.
 */
export type AnyCredentialType = CredentialType<any, any, unknown>;

export interface CredentialSessionService {
  getSession<TSession = unknown>(
    args: Readonly<{
      workflowId: WorkflowId;
      nodeId: NodeId;
      slotKey: string;
    }>,
  ): Promise<TSession>;
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
