import { AppConfigLoader } from "@codemation/host/server";

import { CodemationCliApplicationSession } from "../bootstrap/CodemationCliApplicationSession";
import type { ConsumerCliTsconfigPreparation } from "../consumer/ConsumerCliTsconfigPreparation";
import { CliPathResolver } from "../path/CliPathResolver";
import type { UserAdminConsumerDotenvLoader } from "../user/UserAdminConsumerDotenvLoader";

export type RunCliOptions = Readonly<{
  consumerRoot?: string;
  configPath?: string;
}>;

/**
 * Shared env/config/session wiring for `codemation run *` commands.
 */
export class RunCliBootstrap {
  constructor(
    private readonly appConfigLoader: AppConfigLoader,
    private readonly pathResolver: CliPathResolver,
    private readonly consumerDotenvLoader: UserAdminConsumerDotenvLoader,
    private readonly tsconfigPreparation: ConsumerCliTsconfigPreparation,
  ) {}

  async withSession<T>(
    options: RunCliOptions,
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
