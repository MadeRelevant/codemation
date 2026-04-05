import { AppConfigLoader } from "@codemation/host/server";

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
    private readonly appConfigLoader: AppConfigLoader,
    private readonly pathResolver: CliPathResolver,
    private readonly consumerDotenvLoader: UserAdminConsumerDotenvLoader,
    private readonly tsconfigPreparation: ConsumerCliTsconfigPreparation,
  ) {}

  async withSession<T>(
    options: UserAdminCliOptions,
    fn: (session: CodemationCliApplicationSession) => Promise<T>,
  ): Promise<T> {
    const consumerRoot = options.consumerRoot ?? process.cwd();
    this.consumerDotenvLoader.load(consumerRoot);
    this.tsconfigPreparation.applyWorkspaceTsconfigForTsxIfPresent(consumerRoot);
    const paths = await this.pathResolver.resolve(consumerRoot);
    const loadResult = await this.appConfigLoader.load({
      consumerRoot,
      repoRoot: paths.repoRoot,
      env: process.env,
      configPathOverride: options.configPath,
    });
    if (loadResult.appConfig.auth?.kind !== "local") {
      throw new Error('Codemation user commands require CodemationConfig.auth.kind to be "local".');
    }
    if (loadResult.appConfig.persistence.kind === "none") {
      throw new Error(
        "Database persistence is not configured. Set CodemationConfig.runtime.database (postgresql URL or SQLite file path).",
      );
    }
    const session = await CodemationCliApplicationSession.open({
      appConfig: loadResult.appConfig,
    });
    try {
      return await fn(session);
    } finally {
      await session.close();
    }
  }
}
