import { CodemationConsumerConfigLoader } from "@codemation/host/server";
import type { Logger } from "@codemation/host/next/server";

import { ConsumerDatabaseUrlResolver } from "../database/ConsumerDatabaseUrlResolver";
import type { PrismaMigrateDeployRunner } from "../database/PrismaMigrateDeployInvoker";
import { ConsumerCliTsconfigPreparation } from "../consumer/ConsumerCliTsconfigPreparation";
import type { CliDatabaseUrlDescriptor } from "../user/CliDatabaseUrlDescriptor";
import type { UserAdminConsumerDotenvLoader } from "../user/UserAdminConsumerDotenvLoader";

export type DbMigrateCommandOptions = Readonly<{
  consumerRoot?: string;
  configPath?: string;
}>;

export class DbMigrateCommand {
  constructor(
    private readonly cliLogger: Logger,
    private readonly consumerDotenvLoader: UserAdminConsumerDotenvLoader,
    private readonly tsconfigPreparation: ConsumerCliTsconfigPreparation,
    private readonly configLoader: CodemationConsumerConfigLoader,
    private readonly databaseUrlResolver: ConsumerDatabaseUrlResolver,
    private readonly databaseUrlDescriptor: CliDatabaseUrlDescriptor,
    private readonly hostPackageRoot: string,
    private readonly prismaMigrateDeployRunner: PrismaMigrateDeployRunner,
  ) {}

  async execute(options: DbMigrateCommandOptions): Promise<void> {
    const consumerRoot = options.consumerRoot ?? process.cwd();
    this.consumerDotenvLoader.load(consumerRoot);
    this.tsconfigPreparation.applyWorkspaceTsconfigForTsxIfPresent(consumerRoot);
    const resolution = await this.configLoader.load({
      consumerRoot,
      configPathOverride: options.configPath,
    });
    const databaseUrl = this.databaseUrlResolver.resolve(process.env, resolution.config);
    if (!databaseUrl) {
      throw new Error(
        "DATABASE_URL must be set (in the consumer `.env`) or configured on CodemationConfig.runtime.database.url to run migrations.",
      );
    }
    process.env.DATABASE_URL = databaseUrl;
    const where = this.databaseUrlDescriptor.describeForDisplay(databaseUrl);
    this.cliLogger.info(`Applying Prisma migrations (${where})`);
    const { status } = this.prismaMigrateDeployRunner.run({
      hostPackageRoot: this.hostPackageRoot,
      env: process.env,
    });
    if (status !== 0) {
      throw new Error(`Prisma migrate deploy exited with status ${status === null ? "null" : String(status)}.`);
    }
    this.cliLogger.info("Migrations applied successfully.");
  }
}
