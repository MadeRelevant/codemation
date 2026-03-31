import { inject, injectable } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { AppConfig } from "../../presentation/config/AppConfig";
import { PrismaMigrationDeployer } from "../../infrastructure/persistence/PrismaMigrationDeployer";

@injectable()
export class DatabaseMigrations {
  constructor(
    @inject(ApplicationTokens.AppConfig)
    private readonly appConfig: AppConfig,
    @inject(PrismaMigrationDeployer)
    private readonly prismaMigrationDeployer: PrismaMigrationDeployer,
  ) {}

  async migrate(): Promise<void> {
    await this.prismaMigrationDeployer.deployPersistence(this.appConfig.persistence, this.appConfig.env);
  }
}
