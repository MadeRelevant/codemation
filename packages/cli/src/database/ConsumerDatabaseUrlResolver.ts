import type { CodemationConfig } from "@codemation/host";

/**
 * Resolves the PostgreSQL URL for CLI database operations: consumer `.env` wins, then config.
 */
export class ConsumerDatabaseUrlResolver {
  resolve(processEnv: NodeJS.ProcessEnv, config: CodemationConfig): string | undefined {
    const fromEnv = processEnv.DATABASE_URL?.trim();
    if (fromEnv && fromEnv.length > 0) {
      return fromEnv;
    }
    const fromConfig = config.runtime?.database?.url?.trim();
    if (fromConfig && fromConfig.length > 0) {
      return fromConfig;
    }
    return undefined;
  }
}
