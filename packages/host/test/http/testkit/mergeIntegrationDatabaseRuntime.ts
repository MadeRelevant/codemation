import type { CodemationConfig } from "../../../src/presentation/config/CodemationConfig";
import type { IntegrationDatabase } from "./IntegrationDatabaseFactory";

/**
 * Embeds the integration harness database into {@link CodemationConfig.runtime.database}
 * so host resolution matches production (config-driven; no reliance on `DATABASE_URL` alone).
 */
export function mergeIntegrationDatabaseRuntime(
  config: CodemationConfig,
  database: IntegrationDatabase,
): CodemationConfig {
  return {
    ...config,
    runtime: {
      ...(config.runtime ?? {}),
      database: database.codemationRuntimeDatabase,
    },
  };
}
