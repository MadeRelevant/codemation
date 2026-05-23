import type { AppPersistenceConfig } from "@codemation/host/persistence";
import { CodemationDatabaseUrlParser } from "@codemation/host/persistence";
import path from "node:path";

/**
 * Resolves the database persistence config from `CODEMATION_DATABASE_URL` (DSN). Defaults to
 * a project-local SQLite file when the env var is absent. Mirror of
 * `AppConfigFactory.resolvePersistence` so the CLI migrations command can run BEFORE the
 * consumer config has been loaded — avoiding the ~9s tsx import + workflow discovery on the
 * cold boot path.
 */
export class ConsumerDatabaseConnectionResolver {
  private readonly parser = new CodemationDatabaseUrlParser();

  resolveFromEnv(processEnv: NodeJS.ProcessEnv, consumerRoot: string): AppPersistenceConfig {
    const url = processEnv.CODEMATION_DATABASE_URL?.trim();
    if (url) {
      return this.parser.parse(url, consumerRoot);
    }
    return {
      kind: "sqlite",
      databaseFilePath: path.resolve(consumerRoot, ".codemation", "codemation.sqlite"),
    };
  }
}
