export const workflowsQueryKey = ["workflows"] as const;
export const workflowQueryKey = (workflowId: string) => ["workflow", workflowId] as const;
export const workflowRunsQueryKey = (workflowId: string) => ["workflow-runs", workflowId] as const;
export const workflowDebuggerOverlayQueryKey = (workflowId: string) =>
  ["workflow-debugger-overlay", workflowId] as const;
export const workflowDevBuildStateQueryKey = (workflowId: string) => ["workflow-dev-build-state", workflowId] as const;
export const runQueryKey = (runId: string) => ["run", runId] as const;
export const credentialTypesQueryKey = ["credential-types"] as const;
export const credentialFieldEnvStatusQueryKey = ["credential-field-env-status"] as const;
export const credentialInstancesQueryKey = ["credential-instances"] as const;
export const credentialInstanceWithSecretsQueryKey = (instanceId: string) =>
  ["credential-instance-with-secrets", instanceId] as const;
export const workflowCredentialHealthQueryKey = (workflowId: string) =>
  ["workflow-credential-health", workflowId] as const;
export const userAccountsQueryKey = ["user-accounts"] as const;
