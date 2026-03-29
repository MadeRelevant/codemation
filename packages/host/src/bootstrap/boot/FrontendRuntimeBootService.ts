import { CoreTokens } from "@codemation/core";
import { instanceCachingFactory } from "@codemation/core";
import { Engine } from "@codemation/core/bootstrap";
import { PrismaMigrationDeployer } from "../../infrastructure/persistence/PrismaMigrationDeployer";
import { RuntimeWorkflowActivationPolicy } from "../../infrastructure/persistence/RuntimeWorkflowActivationPolicy";
import { DevelopmentSessionBypassVerifier } from "../../infrastructure/auth/DevelopmentSessionBypassVerifier";
import { AuthJsSessionVerifier } from "../../infrastructure/auth/AuthJsSessionVerifier";
import { ApplicationTokens } from "../../applicationTokens";
import { WorkflowRunEventWebsocketRelay } from "../../application/websocket/WorkflowRunEventWebsocketRelay";
import { ApiPaths } from "../../presentation/http/ApiPaths";
import { WorkflowWebsocketServer } from "../../presentation/websocket/WorkflowWebsocketServer";
import { PreparedCodemationRuntime } from "../PreparedCodemationRuntime";

export class FrontendRuntimeBootService {
  async boot(
    args: Readonly<{
      preparedRuntime: PreparedCodemationRuntime;
      skipPresentationServers?: boolean;
    }>,
  ): Promise<void> {
    await this.applyDatabaseMigrations(args.preparedRuntime);
    await this.hydrateWorkflowActivationPolicy(args.preparedRuntime);
    this.registerSessionVerification(args.preparedRuntime);
    args.preparedRuntime.container.registerInstance(CoreTokens.WebhookBasePath, ApiPaths.webhooks());
    if (args.skipPresentationServers === true) {
      return;
    }
    const workflowRepository = args.preparedRuntime.container.resolve(CoreTokens.WorkflowRepository);
    await args.preparedRuntime.container.resolve(Engine).start([...workflowRepository.list()]);
    await args.preparedRuntime.container.resolve(WorkflowWebsocketServer).start();
    await args.preparedRuntime.container.resolve(WorkflowRunEventWebsocketRelay).start();
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

  private async hydrateWorkflowActivationPolicy(preparedRuntime: PreparedCodemationRuntime): Promise<void> {
    await preparedRuntime.container
      .resolve(RuntimeWorkflowActivationPolicy)
      .hydrateFromRepository(preparedRuntime.container.resolve(ApplicationTokens.WorkflowActivationRepository));
  }

  private registerSessionVerification(preparedRuntime: PreparedCodemationRuntime): void {
    const appConfig = preparedRuntime.container.resolve(ApplicationTokens.AppConfig);
    const env = appConfig.env;
    const authConfig = appConfig.auth;
    const isProduction = env.NODE_ENV === "production";
    if (isProduction && !authConfig) {
      throw new Error("CodemationConfig.auth is required when NODE_ENV is production.");
    }
    if (isProduction && authConfig?.allowUnauthenticatedInDevelopment === true) {
      throw new Error(
        "CodemationAuthConfig.allowUnauthenticatedInDevelopment is not allowed when NODE_ENV is production.",
      );
    }
    const bypassAllowed = !isProduction && authConfig?.allowUnauthenticatedInDevelopment === true;
    if (bypassAllowed) {
      preparedRuntime.container.register(ApplicationTokens.SessionVerifier, {
        useFactory: instanceCachingFactory((dependencyContainer) =>
          dependencyContainer.resolve(DevelopmentSessionBypassVerifier),
        ),
      });
      return;
    }
    const secret = env.AUTH_SECRET ?? "";
    if (!secret) {
      throw new Error(
        "AUTH_SECRET is required unless CodemationAuthConfig.allowUnauthenticatedInDevelopment is enabled in a non-production environment.",
      );
    }
    preparedRuntime.container.register(ApplicationTokens.SessionVerifier, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(AuthJsSessionVerifier)),
    });
  }
}
