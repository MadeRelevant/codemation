import { PrismaMigrationDeployer } from "../../infrastructure/persistence/PrismaMigrationDeployer";
import { RuntimeWorkflowActivationPolicy } from "../../infrastructure/persistence/RuntimeWorkflowActivationPolicy";
import { ApplicationTokens } from "../../applicationTokens";
import { PreparedCodemationRuntime } from "../PreparedCodemationRuntime";

export class CliRuntimeBootService {
  async boot(args: Readonly<{ preparedRuntime: PreparedCodemationRuntime }>): Promise<void> {
    await this.applyDatabaseMigrations(args.preparedRuntime);
    await args.preparedRuntime.container
      .resolve(RuntimeWorkflowActivationPolicy)
      .hydrateFromRepository(args.preparedRuntime.container.resolve(ApplicationTokens.WorkflowActivationRepository));
  }

  private async applyDatabaseMigrations(preparedRuntime: PreparedCodemationRuntime): Promise<void> {
    const appConfig = preparedRuntime.container.resolve(ApplicationTokens.AppConfig);
    if (
      preparedRuntime.implementationSelection.databasePersistence.kind === "none" ||
      preparedRuntime.usesProvidedPrismaClientOverride ||
      appConfig.env.CODEMATION_SKIP_STARTUP_MIGRATIONS === "true"
    ) {
      return;
    }
    await preparedRuntime.container
      .resolve(PrismaMigrationDeployer)
      .deployPersistence(preparedRuntime.implementationSelection.databasePersistence, appConfig.env);
  }
}
