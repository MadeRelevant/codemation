import { BootTimer } from "@codemation/host";
import type { AppPersistenceConfig } from "@codemation/host/persistence";
import type { Logger } from "@codemation/host/next/server";
import path from "node:path";

import { ConsumerDatabaseConnectionResolver } from "./ConsumerDatabaseConnectionResolver";
import type { CliDatabaseUrlDescriptor } from "../user/CliDatabaseUrlDescriptor";
import type { UserAdminConsumerDotenvLoader } from "../user/UserAdminConsumerDotenvLoader";

export type DatabaseMigrationDeployer = {
  deployPersistence(persistence: AppPersistenceConfig, env?: Readonly<NodeJS.ProcessEnv>): Promise<void>;
};

/**
 * Loads the consumer's `.env`, resolves persistence from `CODEMATION_DATABASE_URL`, and runs
 * Prisma migrations. Shared by `codemation db migrate` and `codemation dev` (cold start only).
 *
 * Intentionally does NOT load `codemation.config.ts` — that import is ~9s on a real consumer
 * project (tsx + plugin transitive imports + workflow discovery). Migrations only need the DB
 * connection, which lives in `.env`. Keeping this path config-free is what lets `pnpm dev`
 * start in single-digit seconds.
 */
export class DatabaseMigrationsApplyService {
  constructor(
    private readonly cliLogger: Logger,
    private readonly consumerDotenvLoader: UserAdminConsumerDotenvLoader,
    private readonly databaseConnectionResolver: ConsumerDatabaseConnectionResolver,
    private readonly databaseUrlDescriptor: CliDatabaseUrlDescriptor,
    private readonly hostPackageRoot: string,
    private readonly migrationDeployer: DatabaseMigrationDeployer,
  ) {}

  async applyForConsumer(consumerRoot: string, _options?: Readonly<{ configPath?: string }>): Promise<void> {
    await this.applyInternal(consumerRoot);
  }

  /** Same as {@link applyForConsumer}. Kept for the `db migrate` command's explicit "must have DB" wording. */
  async applyForConsumerRequiringPersistence(
    consumerRoot: string,
    _options?: Readonly<{ configPath?: string }>,
  ): Promise<void> {
    await this.applyInternal(consumerRoot);
  }

  private async applyInternal(consumerRoot: string): Promise<void> {
    BootTimer.measure("dbApply.consumerDotenvLoad", () => this.consumerDotenvLoader.load(consumerRoot));
    const persistence = BootTimer.measure("dbApply.resolveConnection", () =>
      this.databaseConnectionResolver.resolveFromEnv(process.env, consumerRoot),
    );
    process.env.CODEMATION_HOST_PACKAGE_ROOT = this.hostPackageRoot;
    process.env.CODEMATION_PRISMA_CONFIG_PATH = path.join(this.hostPackageRoot, "prisma.config.ts");
    this.cliLogger.debug(
      `Applying database migrations (${this.databaseUrlDescriptor.describePersistence(persistence)})`,
    );
    await BootTimer.measureAsync("dbApply.prismaDeploy", () =>
      this.migrationDeployer.deployPersistence(persistence, process.env),
    );
    this.cliLogger.info(
      `Database migrations applied (${this.databaseUrlDescriptor.describePersistence(persistence)}).`,
    );
  }
}
