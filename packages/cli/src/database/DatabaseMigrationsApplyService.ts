import { CodemationConsumerConfigLoader } from "@codemation/host/server";
import type { ResolvedDatabasePersistence } from "@codemation/host/persistence";
import type { Logger } from "@codemation/host/next/server";

import { ConsumerCliTsconfigPreparation } from "../consumer/ConsumerCliTsconfigPreparation";
import { ConsumerDatabaseConnectionResolver } from "./ConsumerDatabaseConnectionResolver";
import type { CliDatabaseUrlDescriptor } from "../user/CliDatabaseUrlDescriptor";
import type { UserAdminConsumerDotenvLoader } from "../user/UserAdminConsumerDotenvLoader";

export type DatabaseMigrationDeployer = {
  deployPersistence(persistence: ResolvedDatabasePersistence, env?: Readonly<NodeJS.ProcessEnv>): Promise<void>;
};

/**
 * Loads consumer config + env, resolves persistence, and runs Prisma migrations.
 * Shared by `codemation db migrate` and `codemation dev` (cold start only).
 */
export class DatabaseMigrationsApplyService {
  constructor(
    private readonly cliLogger: Logger,
    private readonly consumerDotenvLoader: UserAdminConsumerDotenvLoader,
    private readonly tsconfigPreparation: ConsumerCliTsconfigPreparation,
    private readonly configLoader: CodemationConsumerConfigLoader,
    private readonly databaseConnectionResolver: ConsumerDatabaseConnectionResolver,
    private readonly databaseUrlDescriptor: CliDatabaseUrlDescriptor,
    private readonly hostPackageRoot: string,
    private readonly migrationDeployer: DatabaseMigrationDeployer,
  ) {}

  /**
   * Applies migrations when persistence is configured; no-op when there is no database (in-memory dev).
   */
  async applyForConsumer(consumerRoot: string, options?: Readonly<{ configPath?: string }>): Promise<void> {
    await this.applyInternal(consumerRoot, options, false);
  }

  /**
   * Same as {@link applyForConsumer} but throws when no database is configured (for `db migrate`).
   */
  async applyForConsumerRequiringPersistence(
    consumerRoot: string,
    options?: Readonly<{ configPath?: string }>,
  ): Promise<void> {
    await this.applyInternal(consumerRoot, options, true);
  }

  private async applyInternal(
    consumerRoot: string,
    options: Readonly<{ configPath?: string }> | undefined,
    requirePersistence: boolean,
  ): Promise<void> {
    this.consumerDotenvLoader.load(consumerRoot);
    this.tsconfigPreparation.applyWorkspaceTsconfigForTsxIfPresent(consumerRoot);
    const resolution = await this.configLoader.load({
      consumerRoot,
      configPathOverride: options?.configPath,
    });
    const persistence = this.databaseConnectionResolver.resolve(process.env, resolution.config, consumerRoot);
    if (persistence.kind === "none") {
      if (requirePersistence) {
        throw new Error(
          "Database persistence is not configured. Set CodemationConfig.runtime.database (postgresql URL or PGlite).",
        );
      }
      return;
    }
    process.env.CODEMATION_HOST_PACKAGE_ROOT = this.hostPackageRoot;
    this.cliLogger.debug(
      `Applying database migrations (${this.databaseUrlDescriptor.describePersistence(persistence)})`,
    );
    await this.migrationDeployer.deployPersistence(persistence, process.env);
    this.cliLogger.info(
      `Database migrations applied (${this.databaseUrlDescriptor.describePersistence(persistence)}).`,
    );
  }
}
