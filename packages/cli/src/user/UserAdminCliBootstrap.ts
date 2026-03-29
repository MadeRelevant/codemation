import { CodemationBootstrapRequest } from "@codemation/host";
import { DatabasePersistenceResolver } from "@codemation/host/persistence";
import { CodemationConsumerConfigLoader } from "@codemation/host/server";

import { CodemationCliApplicationSession } from "../bootstrap/CodemationCliApplicationSession";
import type { ConsumerCliTsconfigPreparation } from "../consumer/ConsumerCliTsconfigPreparation";
import { CliPathResolver } from "../path/CliPathResolver";
import type { UserAdminConsumerDotenvLoader } from "./UserAdminConsumerDotenvLoader";

export type UserAdminCliOptions = Readonly<{
  consumerRoot?: string;
  configPath?: string;
}>;

/**
 * Shared env/config/session wiring for `codemation user *` commands (local auth + database).
 */
export class UserAdminCliBootstrap {
  constructor(
    private readonly configLoader: CodemationConsumerConfigLoader,
    private readonly pathResolver: CliPathResolver,
    private readonly consumerDotenvLoader: UserAdminConsumerDotenvLoader,
    private readonly tsconfigPreparation: ConsumerCliTsconfigPreparation,
    private readonly databasePersistenceResolver: DatabasePersistenceResolver,
  ) {}

  async withSession<T>(
    options: UserAdminCliOptions,
    fn: (session: CodemationCliApplicationSession) => Promise<T>,
  ): Promise<T> {
    const consumerRoot = options.consumerRoot ?? process.cwd();
    this.consumerDotenvLoader.load(consumerRoot);
    this.tsconfigPreparation.applyWorkspaceTsconfigForTsxIfPresent(consumerRoot);
    const resolution = await this.configLoader.load({
      consumerRoot,
      configPathOverride: options.configPath,
    });
    if (resolution.config.auth?.kind !== "local") {
      throw new Error('Codemation user commands require CodemationConfig.auth.kind to be "local".');
    }
    const persistence = this.databasePersistenceResolver.resolve({
      runtimeConfig: resolution.config.runtime ?? {},
      env: process.env,
      consumerRoot,
    });
    if (persistence.kind === "none") {
      throw new Error(
        "Database persistence is not configured. Set CodemationConfig.runtime.database (postgresql URL or PGlite).",
      );
    }
    const paths = await this.pathResolver.resolve(consumerRoot);
    const session = await CodemationCliApplicationSession.open({
      resolution,
      bootstrap: new CodemationBootstrapRequest({
        repoRoot: paths.repoRoot,
        consumerRoot,
        env: process.env,
        workflowSources: resolution.workflowSources,
      }),
    });
    try {
      return await fn(session);
    } finally {
      await session.close();
    }
  }
}
