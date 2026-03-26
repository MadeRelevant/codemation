import type { CodemationConfig } from "@codemation/host";
import { DatabasePersistenceResolver } from "@codemation/host/persistence";
import type { ResolvedDatabasePersistence } from "@codemation/host/persistence";

/**
 * Resolves TCP PostgreSQL vs PGlite vs none from env + {@link CodemationConfig} (same rules as the host runtime).
 */
export class ConsumerDatabaseConnectionResolver {
  private readonly resolver = new DatabasePersistenceResolver();

  resolve(processEnv: NodeJS.ProcessEnv, config: CodemationConfig, consumerRoot: string): ResolvedDatabasePersistence {
    return this.resolver.resolve({
      runtimeConfig: config.runtime ?? {},
      env: processEnv,
      consumerRoot,
    });
  }
}
