// Pure-type-only re-exports. Use this for type-only consumers that should not drag in runtime DSL or factory code.
// This subpath prevents unnecessary compile-graph bloat for packages that only need types like NodeId, Items, etc.

export type * from "./contracts/agentMcpTypes";
export { mcpSlotKey } from "./contracts/agentMcpTypes";
export * from "./contracts/AgentBindError";
export * from "./contracts/NoOpAgentMcpIntegration";
export type * from "./contracts/baseTypes";
export type * from "./contracts/assertionTypes";
// assertionTypes also exports a runtime helper for deriving pass/fail from a score+threshold.
// We keep the type-only re-export above and surface the helper explicitly here so UI consumers
// (next-host) don't need to re-implement the comparison.
export { deriveAssertionPassed, DEFAULT_ASSERTION_PASS_THRESHOLD } from "./contracts/assertionTypes";
export type * from "./contracts/params";
export type * from "./contracts/retryPolicySpec.types";
export type * from "./contracts/CostCatalogContract";
export type * from "./contracts/executionPersistenceContracts";
export type * from "./contracts/runtimeTypes";
export type * from "./contracts/telemetryTypes";
export type * from "./contracts/testTriggerTypes";
export type * from "./contracts/runTypes";
export type * from "./contracts/webhookTypes";
export type * from "./contracts/workflowTypes";

// credentialTypes mixes types (Credential* interfaces) with runtime (CredentialUnboundError class).
// Export type-only subset for pure type consumers.
export type {
  CredentialTypeId,
  CredentialInstanceId,
  CredentialMaterialSourceKind,
  CredentialSetupStatus,
  CredentialHealthStatus,
  CredentialFieldSchema,
  CredentialRequirement,
  CredentialBindingKey,
  CredentialBinding,
  CredentialHealth,
  OAuth2ProviderFromPublicConfig,
  CredentialOAuth2ScopesFromPublicConfig,
  CredentialOAuth2AuthDefinition,
  CredentialAuthDefinition,
  CredentialAdvancedSectionPresentation,
  CredentialTypeDefinition,
  CredentialJsonRecord,
  CredentialInstanceRecord,
  CredentialSessionFactoryArgs,
  CredentialSessionFactory,
  CredentialHealthTester,
  CredentialType,
  AnyCredentialType,
  CredentialSessionService,
  CredentialTypeRegistry,
} from "./contracts/credentialTypes";

// CostTrackingTelemetryContract mixes types with const runtime values (metric/attribute names).
// Export type-only subset for pure type consumers.
export type {
  CostTrackingComponent,
  CostTrackingUsageRecord,
  CostTrackingPriceQuote,
  CostTrackingTelemetry,
  CostTrackingTelemetryFactory,
} from "./contracts/CostTrackingTelemetryContract";
