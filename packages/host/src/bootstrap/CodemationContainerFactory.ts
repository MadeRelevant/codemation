import "reflect-metadata";

import type { Container, WorkflowDefinition } from "@codemation/core";
import { CoreTokens, instanceCachingFactory, container as tsyringeContainer } from "@codemation/core";
import {
  EngineRuntimeRegistrar,
  PersistedWorkflowTokenRegistry,
  WorkflowRepositoryWebhookTriggerMatcher,
} from "@codemation/core/bootstrap";
import { AIAgentConnectionWorkflowExpander, ConnectionCredentialNodeConfigFactory } from "@codemation/core-nodes";
import { WorkflowRunEventWebsocketRelay } from "../application/websocket/WorkflowRunEventWebsocketRelay";
import { ApplicationTokens } from "../applicationTokens";
import { CodemationApplication } from "../codemationApplication";
import type { CredentialType } from "../domain/credentials/CredentialServices";
import {
  CredentialBindingService,
  CredentialFieldEnvOverlayService,
  CredentialInstanceService,
  CredentialMaterialResolver,
  CredentialRuntimeMaterialService,
  CredentialSecretCipher,
  CredentialSessionServiceImpl,
  CredentialTestService,
  CredentialTypeRegistryImpl,
} from "../domain/credentials/CredentialServices";
import { OAuth2ConnectService } from "../domain/credentials/OAuth2ConnectServiceFactory";
import { OAuth2ProviderRegistry } from "../domain/credentials/OAuth2ProviderRegistry";
import { WorkflowCredentialNodeResolver } from "../domain/credentials/WorkflowCredentialNodeResolver";
import { UserAccountService } from "../domain/users/UserAccountServiceRegistry";
import type { WorkflowDebuggerOverlayRepository } from "../domain/workflows/WorkflowDebuggerOverlayRepository";
import type { WorkflowDefinitionRepository } from "../domain/workflows/WorkflowDefinitionRepository";
import type { WorkflowRunRepository } from "../domain/runs/WorkflowRunRepository";
import { WorkflowActivationPreflight } from "../domain/workflows/WorkflowActivationPreflight";
import { WorkflowActivationPreflightRules } from "../domain/workflows/WorkflowActivationPreflightRules";
import { BootRuntimeSnapshotHolder } from "../application/dev/BootRuntimeSnapshotHolder";
import { DevBootstrapSummaryAssembler } from "../application/dev/DevBootstrapSummaryAssembler";
import { WorkflowDefinitionMapper } from "../application/mapping/WorkflowDefinitionMapper";
import { WorkflowPolicyUiPresentationFactory } from "../application/mapping/WorkflowPolicyUiPresentationFactory";
import { WorkflowWebsocketServer } from "../presentation/websocket/WorkflowWebsocketServer";
import { DevBootstrapSummaryHttpRouteHandler } from "../presentation/http/routeHandlers/DevBootstrapSummaryHttpRouteHandler";
import { WhitelabelLogoHttpRouteHandler } from "../presentation/http/routeHandlers/WhitelabelLogoHttpRouteHandler";
import { CodemationHonoApiApp } from "../presentation/http/hono/CodemationHonoApiAppFactory";
import { RequestToWebhookItemMapper } from "../infrastructure/webhooks/RequestToWebhookItemMapper";
import { WebhookEndpointPathValidator } from "../application/workflows/WebhookEndpointPathValidator";
import { CodemationIdFactory } from "../infrastructure/ids/CodemationIdFactory";
import { InMemoryCommandBus } from "../infrastructure/di/InMemoryCommandBus";
import { InMemoryDomainEventBus } from "../infrastructure/di/InMemoryDomainEventBus";
import { InMemoryQueryBus } from "../infrastructure/di/InMemoryQueryBus";
import { AuthJsSessionVerifier } from "../infrastructure/auth/AuthJsSessionVerifier";
import { DevelopmentSessionBypassVerifier } from "../infrastructure/auth/DevelopmentSessionBypassVerifier";
import {
  InMemoryCredentialStore,
  PrismaCredentialStore,
} from "../infrastructure/persistence/CredentialPersistenceStore";
import { InMemoryTriggerSetupStateRepository } from "../infrastructure/persistence/InMemoryTriggerSetupStateRepository";
import { InMemoryWorkflowActivationRepository } from "../infrastructure/persistence/InMemoryWorkflowActivationRepository";
import { InMemoryWorkflowDebuggerOverlayRepository } from "../infrastructure/persistence/InMemoryWorkflowDebuggerOverlayRepository";
import { InMemoryWorkflowRunRepository } from "../infrastructure/persistence/InMemoryWorkflowRunRepository";
import { PrismaClientFactory } from "../infrastructure/persistence/PrismaClientFactory";
import { PrismaMigrationDeployer } from "../infrastructure/persistence/PrismaMigrationDeployer";
import { PrismaTriggerSetupStateRepository } from "../infrastructure/persistence/PrismaTriggerSetupStateRepository";
import { PrismaWorkflowActivationRepository } from "../infrastructure/persistence/PrismaWorkflowActivationRepository";
import { PrismaWorkflowDebuggerOverlayRepository } from "../infrastructure/persistence/PrismaWorkflowDebuggerOverlayRepository";
import { RuntimeWorkflowActivationPolicy } from "../infrastructure/persistence/RuntimeWorkflowActivationPolicy";
import { WorkflowDefinitionRepositoryAdapter } from "../infrastructure/persistence/WorkflowDefinitionRepositoryAdapter";
import { WorkflowRunRepository as SqlWorkflowRunRepository } from "../infrastructure/persistence/WorkflowRunRepository";
import { LiveWorkflowRepository } from "../infrastructure/runtime/LiveWorkflowRepository";
import { LogLevelPolicyFactory, logLevelPolicyFactory } from "../infrastructure/logging/LogLevelPolicyFactory";
import { ServerLoggerFactory } from "../infrastructure/logging/ServerLoggerFactory";
import type { AppConfig } from "../presentation/config/AppConfig";
import type { CodemationApplicationRuntimeConfig } from "../presentation/config/CodemationConfig";
import type { CodemationContainerRegistration } from "./CodemationContainerRegistration";
import { CodemationContainerRegistrationRegistrar } from "./CodemationContainerRegistrationRegistrar";

type CodemationContainerState = Readonly<{
  application: CodemationApplication;
  registrations: ReadonlyArray<CodemationContainerRegistration<unknown>>;
  runtimeConfig: CodemationApplicationRuntimeConfig;
  workflows: ReadonlyArray<WorkflowDefinition>;
  credentialTypes: ReadonlyArray<CredentialType<any, any, unknown>>;
  sharedWorkflowWebsocketServer: WorkflowWebsocketServer | null;
}>;

export class CodemationContainerFactory {
  constructor(
    private readonly containerRegistrationRegistrar: CodemationContainerRegistrationRegistrar = new CodemationContainerRegistrationRegistrar(),
  ) {}

  create(state: CodemationContainerState): Container {
    const container = tsyringeContainer.createChildContainer();
    this.registerCoreInfrastructure(container, state);
    this.registerRepositoriesAndBuses(container);
    this.registerApplicationServicesAndRoutes(container);
    this.registerOperationalInfrastructure(container);
    this.registerConfiguredRegistrations(container, state.registrations);
    this.registerCredentialTypes(container, state.credentialTypes);
    this.synchronizeLiveWorkflowRepository(container, state.workflows);
    return container;
  }

  private registerCredentialTypes(
    container: Container,
    credentialTypes: ReadonlyArray<CredentialType<any, any, unknown>>,
  ): void {
    const registry = container.resolve(CredentialTypeRegistryImpl);
    for (const credentialType of credentialTypes) {
      registry.register(credentialType);
    }
  }

  private registerConfiguredRegistrations(
    container: Container,
    registrations: ReadonlyArray<CodemationContainerRegistration<unknown>>,
  ): void {
    if (registrations.length === 0) {
      return;
    }
    this.containerRegistrationRegistrar.apply(container, registrations);
  }

  private registerCoreInfrastructure(container: Container, state: CodemationContainerState): void {
    container.registerInstance(BootRuntimeSnapshotHolder, new BootRuntimeSnapshotHolder());
    container.registerInstance(CodemationApplication, state.application);
    container.registerInstance(CoreTokens.PersistedWorkflowTokenRegistry, new PersistedWorkflowTokenRegistry());
    container.register(CredentialTypeRegistryImpl, {
      useFactory: instanceCachingFactory(() => new CredentialTypeRegistryImpl()),
    });
    container.register(CoreTokens.CredentialTypeRegistry, {
      useFactory: instanceCachingFactory((dependencyContainer) =>
        dependencyContainer.resolve(CredentialTypeRegistryImpl),
      ),
    });
    container.register(CodemationIdFactory, { useClass: CodemationIdFactory });
    container.register(CoreTokens.RunIdFactory, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationIdFactory)),
    });
    container.register(CoreTokens.ActivationIdFactory, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(CodemationIdFactory)),
    });
    container.register(CoreTokens.LiveWorkflowRepository, {
      useFactory: instanceCachingFactory(
        () =>
          new LiveWorkflowRepository(
            new AIAgentConnectionWorkflowExpander(new ConnectionCredentialNodeConfigFactory()),
          ),
      ),
    });
    container.register(CoreTokens.WorkflowRepository, {
      useFactory: instanceCachingFactory((dependencyContainer) =>
        dependencyContainer.resolve(CoreTokens.LiveWorkflowRepository),
      ),
    });
    container.registerInstance(CoreTokens.NodeResolver, container);
    const runtimeWorkflowActivationPolicy = new RuntimeWorkflowActivationPolicy();
    container.registerInstance(RuntimeWorkflowActivationPolicy, runtimeWorkflowActivationPolicy);
    container.registerInstance(CoreTokens.WorkflowActivationPolicy, runtimeWorkflowActivationPolicy);
    new EngineRuntimeRegistrar().register(container, {
      resolveEngineExecutionLimits: () => state.runtimeConfig.engineExecutionLimits,
      webhookTriggerMatcherProvider: {
        createMatcher: (dependencyContainer) => {
          const serverLoggerFactory = dependencyContainer.resolve(ServerLoggerFactory);
          const webhookRoutingLogger = serverLoggerFactory.create("codemation.webhooks.routing");
          return new WorkflowRepositoryWebhookTriggerMatcher(
            dependencyContainer.resolve(CoreTokens.WorkflowRepository),
            dependencyContainer.resolve(CoreTokens.WorkflowActivationPolicy),
            {
              warn: (message) => webhookRoutingLogger.warn(message),
              info: (message) => webhookRoutingLogger.debug(message),
            },
          );
        },
      },
      triggerRuntimeDiagnosticsProvider: {
        create: (dependencyContainer) => {
          const triggerRuntimeLogger = dependencyContainer
            .resolve(ServerLoggerFactory)
            .create("codemation.engine.triggers");
          return {
            info: (message) => triggerRuntimeLogger.debug(message),
            warn: (message) => triggerRuntimeLogger.warn(message),
          };
        },
      },
    });
    container.registerInstance(LogLevelPolicyFactory, logLevelPolicyFactory);
    container.register(ServerLoggerFactory, { useClass: ServerLoggerFactory });
    container.register(ApplicationTokens.LoggerFactory, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(ServerLoggerFactory)),
    });
    container.register(ApplicationTokens.PerformanceDiagnosticsLogger, {
      useFactory: instanceCachingFactory((dependencyContainer) =>
        dependencyContainer.resolve(ServerLoggerFactory).createPerformanceDiagnostics("codemation.performance"),
      ),
    });
    container.register(WorkflowWebsocketServer, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        if (state.sharedWorkflowWebsocketServer) {
          return state.sharedWorkflowWebsocketServer;
        }
        return new WorkflowWebsocketServer(
          dependencyContainer.resolve(ApplicationTokens.WebSocketPort),
          dependencyContainer.resolve(ApplicationTokens.WebSocketBindHost),
          dependencyContainer.resolve(ServerLoggerFactory).create("codemation-websocket.server"),
        );
      }),
    });
    container.register(PrismaClientFactory, { useClass: PrismaClientFactory });
    container.register(PrismaMigrationDeployer, { useClass: PrismaMigrationDeployer });
    container.register(WorkflowPolicyUiPresentationFactory, { useClass: WorkflowPolicyUiPresentationFactory });
    container.register(WorkflowDefinitionMapper, { useClass: WorkflowDefinitionMapper });
    container.register(RequestToWebhookItemMapper, { useClass: RequestToWebhookItemMapper });
    container.register(WebhookEndpointPathValidator, { useClass: WebhookEndpointPathValidator });
    container.register(CredentialSecretCipher, { useClass: CredentialSecretCipher });
    container.register(CredentialMaterialResolver, { useClass: CredentialMaterialResolver });
    container.register(CredentialFieldEnvOverlayService, { useClass: CredentialFieldEnvOverlayService });
    container.register(CredentialRuntimeMaterialService, { useClass: CredentialRuntimeMaterialService });
    container.register(WorkflowCredentialNodeResolver, { useClass: WorkflowCredentialNodeResolver });
    container.register(CredentialInstanceService, { useClass: CredentialInstanceService });
    container.register(CredentialBindingService, { useClass: CredentialBindingService });
    container.register(WorkflowActivationPreflightRules, { useClass: WorkflowActivationPreflightRules });
    container.register(WorkflowActivationPreflight, { useClass: WorkflowActivationPreflight });
    container.register(CredentialTestService, { useClass: CredentialTestService });
    container.register(CredentialSessionServiceImpl, { useClass: CredentialSessionServiceImpl });
    container.register(OAuth2ProviderRegistry, { useClass: OAuth2ProviderRegistry });
    container.register(OAuth2ConnectService, { useClass: OAuth2ConnectService });
    container.register(DevelopmentSessionBypassVerifier, { useClass: DevelopmentSessionBypassVerifier });
    container.register(AuthJsSessionVerifier, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        const appConfig = dependencyContainer.resolve<AppConfig>(ApplicationTokens.AppConfig);
        return new AuthJsSessionVerifier(appConfig.env.AUTH_SECRET ?? "");
      }),
    });
    container.register(UserAccountService, { useClass: UserAccountService });
  }

  private registerRepositoriesAndBuses(container: Container): void {
    container.register(WorkflowDefinitionRepositoryAdapter, { useClass: WorkflowDefinitionRepositoryAdapter });
    container.register(InMemoryWorkflowRunRepository, { useClass: InMemoryWorkflowRunRepository });
    container.register(InMemoryTriggerSetupStateRepository, { useClass: InMemoryTriggerSetupStateRepository });
    container.register(InMemoryCredentialStore, { useClass: InMemoryCredentialStore });
    container.register(SqlWorkflowRunRepository, { useClass: SqlWorkflowRunRepository });
    container.register(InMemoryWorkflowDebuggerOverlayRepository, {
      useClass: InMemoryWorkflowDebuggerOverlayRepository,
    });
    container.register(PrismaTriggerSetupStateRepository, { useClass: PrismaTriggerSetupStateRepository });
    container.register(PrismaWorkflowDebuggerOverlayRepository, {
      useClass: PrismaWorkflowDebuggerOverlayRepository,
    });
    container.register(PrismaWorkflowActivationRepository, { useClass: PrismaWorkflowActivationRepository });
    container.register(InMemoryWorkflowActivationRepository, { useClass: InMemoryWorkflowActivationRepository });
    container.register(PrismaCredentialStore, { useClass: PrismaCredentialStore });
    container.register(ApplicationTokens.WorkflowDefinitionRepository, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) =>
          dependencyContainer.resolve(WorkflowDefinitionRepositoryAdapter) as unknown as WorkflowDefinitionRepository,
      ),
    });
    container.register(ApplicationTokens.WorkflowRunRepository, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) =>
          dependencyContainer.resolve(SqlWorkflowRunRepository) as unknown as WorkflowRunRepository,
      ),
    });
    container.register(ApplicationTokens.WorkflowDebuggerOverlayRepository, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) =>
          dependencyContainer.resolve(
            InMemoryWorkflowDebuggerOverlayRepository,
          ) as unknown as WorkflowDebuggerOverlayRepository,
      ),
    });
    container.register(ApplicationTokens.CredentialStore, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(InMemoryCredentialStore)),
    });
    container.register(InMemoryQueryBus, { useClass: InMemoryQueryBus });
    container.register(InMemoryCommandBus, { useClass: InMemoryCommandBus });
    container.register(InMemoryDomainEventBus, { useClass: InMemoryDomainEventBus });
    container.register(ApplicationTokens.QueryBus, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(InMemoryQueryBus)),
    });
    container.register(ApplicationTokens.CommandBus, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(InMemoryCommandBus)),
    });
    container.register(ApplicationTokens.DomainEventBus, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(InMemoryDomainEventBus)),
    });
  }

  private registerApplicationServicesAndRoutes(container: Container): void {
    container.register(DevBootstrapSummaryAssembler, { useClass: DevBootstrapSummaryAssembler });
    container.register(DevBootstrapSummaryHttpRouteHandler, { useClass: DevBootstrapSummaryHttpRouteHandler });
    container.register(WhitelabelLogoHttpRouteHandler, { useClass: WhitelabelLogoHttpRouteHandler });
    container.register(CodemationHonoApiApp, { useClass: CodemationHonoApiApp });
  }

  private registerOperationalInfrastructure(container: Container): void {
    container.register(ApplicationTokens.WorkflowWebsocketPublisher, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(WorkflowWebsocketServer)),
    });
    container.register(WorkflowRunEventWebsocketRelay, { useClass: WorkflowRunEventWebsocketRelay });
  }

  private synchronizeLiveWorkflowRepository(container: Container, workflows: ReadonlyArray<WorkflowDefinition>): void {
    const liveWorkflowRepository = container.resolve(CoreTokens.LiveWorkflowRepository);
    liveWorkflowRepository.setWorkflows(workflows);
    if (container.isRegistered(WebhookEndpointPathValidator, true)) {
      container.resolve(WebhookEndpointPathValidator).validateAndWarn(workflows);
    }
  }
}
