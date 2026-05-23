import type { AppConfig } from "../../src/presentation/config/AppConfig";

/**
 * Creates a minimal AppConfig suitable for unit tests.
 * Uses SQLite defaults; pass overrides to customise specific fields.
 */
export function makeAppConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    consumerRoot: "/test-consumer",
    repoRoot: "/test-repo",
    env: {},
    workflowSources: [],
    workflows: [],
    containerRegistrations: [],
    credentialTypes: [],
    collections: [],
    plugins: [],
    mcpServers: [],
    hasConfiguredCredentialSessionServiceRegistration: false,
    persistence: { kind: "sqlite", databaseFilePath: "/test-consumer/.codemation/codemation.sqlite" },
    scheduler: { kind: "local", workerQueues: [] },
    eventing: { kind: "memory" },
    whitelabel: { appName: "Codemation" },
    webSocketPort: 4000,
    webSocketBindHost: "127.0.0.1",
    ...overrides,
  } as AppConfig;
}
