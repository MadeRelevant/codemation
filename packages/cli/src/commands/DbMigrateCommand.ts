import type { DatabaseMigrationsApplyService } from "../database/DatabaseMigrationsApplyService";

export type DbMigrateCommandOptions = Readonly<{
  consumerRoot?: string;
  configPath?: string;
}>;

export class DbMigrateCommand {
  constructor(private readonly databaseMigrationsApplyService: DatabaseMigrationsApplyService) {}

  async execute(options: DbMigrateCommandOptions): Promise<void> {
    await this.databaseMigrationsApplyService.applyForConsumerRequiringPersistence(
      options.consumerRoot ?? process.cwd(),
      {
        configPath: options.configPath,
      },
    );
  }
}
