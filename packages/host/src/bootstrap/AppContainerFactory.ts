import "reflect-metadata";

import type { Container } from "@codemation/core";
import {
  CoreTokens,
  EventPublishingWorkflowExecutionRepository,
  InMemoryRunEventBus,
  instanceCachingFactory,
  SystemClock,
  container as tsyringeContainer,
  type WorkflowDefinition,
  type WorkflowPolicyRuntimeDefaults,
} from "@codemation/core";
import {
  CatalogBackedCostTrackingTelemetryFactory,
  ConfigDrivenOffloadPolicy,
  DefaultDrivingScheduler,
  DefaultExecutionContextFactory,
  EngineRuntimeRegistrar,
  InMemoryRunDataFactory,
  InlineDrivingScheduler,
  PersistedWorkflowTokenRegistry,
  StaticCostCatalog,
  WorkflowRepositoryWebhookTriggerMatcher,
} from "@codemation/core/bootstrap";
import { AIAgentConnectionWorkflowExpander, ConnectionCredentialNodeConfigFactory } from "@codemation/core-nodes";
import {
  CreateCredentialInstanceCommandHandler,
  DeleteCredentialInstanceCommandHandler,
  TestCredentialInstanceCommandHandler,
  UpdateCredentialInstanceCommandHandler,
  UpsertCredentialBindingCommandHandler,
} from "../application/commands/CredentialCommandHandlers";
import {
  AcceptUserInviteCommandHandler,
  InviteUserCommandHandler,
  RegenerateUserInviteCommandHandler,
  UpdateUserAccountStatusCommandHandler,
  UpsertLocalBootstrapUserCommandHandler,
} from "../application/commands/UserAccountCommandHandlers";
import {
  CopyRunToWorkflowDebuggerCommandHandler,
  HandleWebhookInvocationCommandHandler,
  ReplaceMutableRunWorkflowSnapshotCommandHandler,
  ReplaceWorkflowDebuggerOverlayCommandHandler,
  ReplayWorkflowNodeCommandHandler,
  SetPinnedNodeInputCommandHandler,
  SetWorkflowActivationCommandHandler,
  StartWorkflowRunCommandHandler,
  UploadOverlayPinnedBinaryCommandHandler,
} from "../application/commands/WorkflowCommandHandlers";
import {
  GetCredentialFieldEnvStatusQueryHandler,
  GetCredentialInstanceQueryHandler,
  GetCredentialInstanceWithSecretsQueryHandler,
  GetWorkflowCredentialHealthQueryHandler,
  ListCredentialInstancesQueryHandler,
  ListCredentialTypesQueryHandler,
} from "../application/queries/CredentialQueryHandlers";
import {
  ListUserAccountsQueryHandler,
  VerifyUserInviteQueryHandler,
} from "../application/queries/UserAccountQueryHandlers";
import {
  GetIterationCostQueryHandler,
  GetRunBinaryAttachmentQueryHandler,
  GetTelemetryDashboardDimensionsQueryHandler,
  GetTelemetryDashboardRunsQueryHandler,
  GetTelemetryRunTraceQueryHandler,
  GetTelemetryDashboardSummaryQueryHandler,
  GetTelemetryDashboardTimeseriesQueryHandler,
  GetRunStateQueryHandler,
  GetWorkflowDebuggerOverlayQueryHandler,
  GetWorkflowDetailQueryHandler,
  GetWorkflowRunDetailQueryHandler,
  GetWorkflowOverlayBinaryAttachmentQueryHandler,
  GetWorkflowSummariesQueryHandler,
  ListWorkflowRunsQueryHandler,
} from "../application/queries/WorkflowQueryHandlers";
import { RunIterationProjectionFactory } from "../application/queries/RunIterationProjectionFactory";
import { OpenAiApiKeyCredentialHealthTester } from "../infrastructure/credentials/OpenAiApiKeyCredentialHealthTester";
import { OpenAiApiKeyCredentialTypeFactory } from "../infrastructure/credentials/OpenAiApiKeyCredentialTypeFactory";
import { CodemationPluginRegistrar } from "../infrastructure/config/CodemationPluginRegistrar";
import { WorkflowRunEventWebsocketRelay } from "../application/websocket/WorkflowRunEventWebsocketRelay";
import { FrameworkCostCatalogEntries } from "../application/cost/FrameworkCostCatalogEntries";
import { CompositeTelemetryExporter } from "../application/telemetry/CompositeTelemetryExporter";
import { LazyExecutionTelemetryFactory } from "../application/telemetry/LazyExecutionTelemetryFactory";
import { NoOpTelemetryExporter } from "../application/telemetry/NoOpTelemetryExporter";
import { OtelExecutionTelemetryFactory } from "../application/telemetry/OtelExecutionTelemetryFactory";
import { OtelIdentityFactory } from "../application/telemetry/OtelIdentityFactory";
import { RunEventBusTelemetryReporter } from "../application/telemetry/RunEventBusTelemetryReporter";
import { TelemetryEnricherChain } from "../application/telemetry/TelemetryEnricherChain";
import { TelemetryPrivacyPolicy } from "../application/telemetry/TelemetryPrivacyPolicy";
import { TelemetryQueryService } from "../application/telemetry/TelemetryQueryService";
import { TelemetryRetentionTimestampFactory } from "../application/telemetry/TelemetryRetentionTimestampFactory";
import { ApplicationTokens } from "../applicationTokens";
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
import { UserAccountSessionPolicy } from "../domain/users/UserAccountSessionPolicy";
import type { WorkflowDebuggerOverlayRepository } from "../domain/workflows/WorkflowDebuggerOverlayRepository";
import type { WorkflowDefinitionRepository } from "../domain/workflows/WorkflowDefinitionRepository";
import { WorkflowActivationPreflight } from "../domain/workflows/WorkflowActivationPreflight";
import { WorkflowActivationPreflightRules } from "../domain/workflows/WorkflowActivationPreflightRules";
import { BootRuntimeSnapshotHolder } from "../application/dev/BootRuntimeSnapshotHolder";
import type { BootRuntimeSummary } from "../application/dev/BootRuntimeSummary.types";
import { DevBootstrapSummaryAssembler } from "../application/dev/DevBootstrapSummaryAssembler";
import { WorkflowDefinitionMapper } from "../application/mapping/WorkflowDefinitionMapper";
import { WorkflowPolicyUiPresentationFactory } from "../application/mapping/WorkflowPolicyUiPresentationFactory";
import { WorkflowWebsocketServer } from "../presentation/websocket/WorkflowWebsocketServer";
import { CodemationFrontendAuthSnapshotFactory } from "../presentation/frontend/CodemationFrontendAuthSnapshotFactory";
import { FrontendAppConfigFactory } from "../presentation/frontend/FrontendAppConfigFactory";
import { InternalAuthBootstrapFactory } from "../presentation/frontend/InternalAuthBootstrapFactory";
import { PublicFrontendBootstrapFactory } from "../presentation/frontend/PublicFrontendBootstrapFactory";
import { AuthHttpRouteHandler } from "../presentation/http/routeHandlers/AuthHttpRouteHandlerFactory";
import { DevBootstrapSummaryHttpRouteHandler } from "../presentation/http/routeHandlers/DevBootstrapSummaryHttpRouteHandler";
import { InternalAuthBootstrapHttpRouteHandler } from "../presentation/http/routeHandlers/InternalAuthBootstrapHttpRouteHandler";
import { PublicFrontendBootstrapHttpRouteHandler } from "../presentation/http/routeHandlers/PublicFrontendBootstrapHttpRouteHandler";
import { WhitelabelLogoHttpRouteHandler } from "../presentation/http/routeHandlers/WhitelabelLogoHttpRouteHandler";
import { CodemationHonoApiApp } from "../presentation/http/hono/CodemationHonoApiAppFactory";
import { AuthHonoApiRouteRegistrar } from "../presentation/http/hono/registrars/AuthHonoApiRouteRegistrar";
import { BinaryHonoApiRouteRegistrar } from "../presentation/http/hono/registrars/BinaryHonoApiRouteRegistrar";
import { BootstrapHonoApiRouteRegistrar } from "../presentation/http/hono/registrars/BootstrapHonoApiRouteRegistrar";
import { CredentialHonoApiRouteRegistrar } from "../presentation/http/hono/registrars/CredentialHonoApiRouteRegistrar";
import { DevHonoApiRouteRegistrar } from "../presentation/http/hono/registrars/DevHonoApiRouteRegistrar";
import { OAuth2HonoApiRouteRegistrar } from "../presentation/http/hono/registrars/OAuth2HonoApiRouteRegistrar";
import { RunHonoApiRouteRegistrar } from "../presentation/http/hono/registrars/RunHonoApiRouteRegistrar";
import { TelemetryHonoApiRouteRegistrar } from "../presentation/http/hono/registrars/TelemetryHonoApiRouteRegistrar";
import { UserHonoApiRouteRegistrar } from "../presentation/http/hono/registrars/UserHonoApiRouteRegistrar";
import { WebhookHonoApiRouteRegistrar } from "../presentation/http/hono/registrars/WebhookHonoApiRouteRegistrar";
import { WhitelabelHonoApiRouteRegistrar } from "../presentation/http/hono/registrars/WhitelabelHonoApiRouteRegistrar";
import { WorkflowHonoApiRouteRegistrar } from "../presentation/http/hono/registrars/WorkflowHonoApiRouteRegistrar";
import { ApiPaths } from "../presentation/http/ApiPaths";
import { RequestToWebhookItemMapper } from "../infrastructure/webhooks/RequestToWebhookItemMapper";
import { WebhookEndpointPathValidator } from "../application/workflows/WebhookEndpointPathValidator";
import { CodemationIdFactory } from "../infrastructure/ids/CodemationIdFactory";
import { InMemoryCommandBus } from "../infrastructure/di/InMemoryCommandBus";
import { InMemoryDomainEventBus } from "../infrastructure/di/InMemoryDomainEventBus";
import { InMemoryQueryBus } from "../infrastructure/di/InMemoryQueryBus";
import { AuthSessionCookieFactory } from "../infrastructure/auth/AuthSessionCookieFactory";
import { BetterAuthApiSessionVerifier } from "../infrastructure/auth/BetterAuthApiSessionVerifier";
import { PrismaUserAccountSessionEligibilityChecker } from "../infrastructure/auth/PrismaUserAccountSessionEligibilityChecker";
import { CodemationBetterAuthBcryptPasswordCodec } from "../infrastructure/auth/CodemationBetterAuthBcryptPasswordCodec";
import { CodemationBetterAuthDatabaseOptionsFactory } from "../infrastructure/auth/CodemationBetterAuthDatabaseOptionsFactory";
import { CodemationBetterAuthRuntime } from "../infrastructure/auth/CodemationBetterAuthRuntime";
import { CodemationBetterAuthBaseUrlPolicy } from "../infrastructure/auth/CodemationBetterAuthBaseUrlPolicy";
import { CodemationBetterAuthServerFactory } from "../infrastructure/auth/CodemationBetterAuthServerFactory";
import { InAppCallbackUrlPolicy } from "../infrastructure/auth/InAppCallbackUrlPolicy";
import { SecureRequestDetector } from "../infrastructure/auth/SecureRequestDetector";
import { CodemationSessionVerifier } from "../infrastructure/auth/CodemationSessionVerifier";
import { DevelopmentSessionBypassVerifier } from "../infrastructure/auth/DevelopmentSessionBypassVerifier";
import {
  InMemoryCredentialStore,
  PrismaCredentialStore,
} from "../infrastructure/persistence/CredentialPersistenceStore";
import { InMemoryTriggerSetupStateRepository } from "../infrastructure/persistence/InMemoryTriggerSetupStateRepository";
import { InMemoryRunTraceContextRepository } from "../infrastructure/persistence/InMemoryRunTraceContextRepository";
import { InMemoryTelemetryArtifactStore } from "../infrastructure/persistence/InMemoryTelemetryArtifactStore";
import { InMemoryTelemetryMetricPointStore } from "../infrastructure/persistence/InMemoryTelemetryMetricPointStore";
import { InMemoryTelemetrySpanStore } from "../infrastructure/persistence/InMemoryTelemetrySpanStore";
import { InMemoryWorkflowActivationRepository } from "../infrastructure/persistence/InMemoryWorkflowActivationRepository";
import { InMemoryWorkflowDebuggerOverlayRepository } from "../infrastructure/persistence/InMemoryWorkflowDebuggerOverlayRepository";
import { InMemoryWorkflowRunRepository } from "../infrastructure/persistence/InMemoryWorkflowRunRepository";
import {
  PrismaDatabaseClientToken,
  type PrismaDatabaseClient,
} from "../infrastructure/persistence/PrismaDatabaseClient";
import { PrismaClientFactory } from "../infrastructure/persistence/PrismaClientFactory";
import { PrismaTriggerSetupStateRepository } from "../infrastructure/persistence/PrismaTriggerSetupStateRepository";
import { PrismaRunTraceContextRepository } from "../infrastructure/persistence/PrismaRunTraceContextRepository";
import { PrismaTelemetryArtifactStore } from "../infrastructure/persistence/PrismaTelemetryArtifactStore";
import { PrismaTelemetryMetricPointStore } from "../infrastructure/persistence/PrismaTelemetryMetricPointStore";
import { PrismaTelemetrySpanStore } from "../infrastructure/persistence/PrismaTelemetrySpanStore";
import { PrismaWorkflowActivationRepository } from "../infrastructure/persistence/PrismaWorkflowActivationRepository";
import { PrismaWorkflowDebuggerOverlayRepository } from "../infrastructure/persistence/PrismaWorkflowDebuggerOverlayRepository";
import { PrismaWorkflowRunRepository } from "../infrastructure/persistence/PrismaWorkflowRunRepository";
import { RuntimeWorkflowActivationPolicy } from "../infrastructure/persistence/RuntimeWorkflowActivationPolicy";
import { WorkflowDefinitionRepositoryAdapter } from "../infrastructure/persistence/WorkflowDefinitionRepositoryAdapter";
import { WorkflowRunRepository as SqlWorkflowRunRepository } from "../infrastructure/persistence/WorkflowRunRepository";
import { LiveWorkflowRepository } from "../infrastructure/runtime/LiveWorkflowRepository";
import { LogLevelPolicyFactory, logLevelPolicyFactory } from "../infrastructure/logging/LogLevelPolicyFactory";
import { ServerLoggerFactory } from "../infrastructure/logging/ServerLoggerFactory";
import type { AppConfig } from "../presentation/config/AppConfig";
import { CodemationContainerRegistrationRegistrar } from "./CodemationContainerRegistrationRegistrar";
import { LocalFilesystemBinaryStorage } from "../infrastructure/binary/LocalFilesystemBinaryStorageRegistry";
import { InMemoryBinaryStorage } from "@codemation/core/bootstrap";
import { RedisRunEventBus } from "@codemation/eventbus-redis";
import { AppContainerLifecycle } from "./AppContainerLifecycle";
import { WorkflowRunRetentionPruneScheduler } from "../application/runs/WorkflowRunRetentionPruneScheduler";
import { DatabaseMigrations } from "./runtime/DatabaseMigrations";
import { FrontendRuntime } from "./runtime/FrontendRuntime";
import { WorkerRuntime } from "./runtime/WorkerRuntime";
import { BullmqScheduler } from "../infrastructure/scheduler/bullmq/BullmqScheduler";

type AppContainerInputs = Readonly<{
  appConfig: AppConfig;
  sharedWorkflowWebsocketServer: WorkflowWebsocketServer | null;
}>;

type PrismaOwnership = Readonly<{
  ownedPrismaClient: PrismaDatabaseClient | null;
}>;

export class AppContainerFactory {
  private static readonly queryHandlers = [
    GetCredentialFieldEnvStatusQueryHandler,
    GetCredentialInstanceQueryHandler,
    GetCredentialInstanceWithSecretsQueryHandler,
    GetWorkflowCredentialHealthQueryHandler,
    ListCredentialInstancesQueryHandler,
    ListCredentialTypesQueryHandler,
    ListUserAccountsQueryHandler,
    VerifyUserInviteQueryHandler,
    GetIterationCostQueryHandler,
    GetRunBinaryAttachmentQueryHandler,
    GetTelemetryDashboardDimensionsQueryHandler,
    GetTelemetryDashboardRunsQueryHandler,
    GetTelemetryRunTraceQueryHandler,
    GetTelemetryDashboardSummaryQueryHandler,
    GetTelemetryDashboardTimeseriesQueryHandler,
    GetRunStateQueryHandler,
    GetWorkflowRunDetailQueryHandler,
    GetWorkflowDebuggerOverlayQueryHandler,
    GetWorkflowDetailQueryHandler,
    GetWorkflowOverlayBinaryAttachmentQueryHandler,
    GetWorkflowSummariesQueryHandler,
    ListWorkflowRunsQueryHandler,
  ] as const;
  private static readonly commandHandlers = [
    CreateCredentialInstanceCommandHandler,
    DeleteCredentialInstanceCommandHandler,
    TestCredentialInstanceCommandHandler,
    UpdateCredentialInstanceCommandHandler,
    UpsertCredentialBindingCommandHandler,
    AcceptUserInviteCommandHandler,
    InviteUserCommandHandler,
    RegenerateUserInviteCommandHandler,
    UpdateUserAccountStatusCommandHandler,
    UpsertLocalBootstrapUserCommandHandler,
    CopyRunToWorkflowDebuggerCommandHandler,
    HandleWebhookInvocationCommandHandler,
    ReplaceMutableRunWorkflowSnapshotCommandHandler,
    ReplaceWorkflowDebuggerOverlayCommandHandler,
    ReplayWorkflowNodeCommandHandler,
    SetPinnedNodeInputCommandHandler,
    SetWorkflowActivationCommandHandler,
    StartWorkflowRunCommandHandler,
    UploadOverlayPinnedBinaryCommandHandler,
  ] as const;
  private static readonly honoRouteRegistrars = [
    AuthHonoApiRouteRegistrar,
    BinaryHonoApiRouteRegistrar,
    BootstrapHonoApiRouteRegistrar,
    CredentialHonoApiRouteRegistrar,
    DevHonoApiRouteRegistrar,
    OAuth2HonoApiRouteRegistrar,
    RunHonoApiRouteRegistrar,
    TelemetryHonoApiRouteRegistrar,
    UserHonoApiRouteRegistrar,
    WebhookHonoApiRouteRegistrar,
    WhitelabelHonoApiRouteRegistrar,
    WorkflowHonoApiRouteRegistrar,
  ] as const;

  constructor(
    private readonly containerRegistrationRegistrar: CodemationContainerRegistrationRegistrar = new CodemationContainerRegistrationRegistrar(),
    private readonly pluginRegistrar: CodemationPluginRegistrar = new CodemationPluginRegistrar(),
  ) {}

  async create(inputs: AppContainerInputs): Promise<Container> {
    const container = tsyringeContainer.createChildContainer();
    container.registerInstance(ApplicationTokens.AppConfig, inputs.appConfig);
    this.registerCoreInfrastructure(container, inputs);
    this.registerRepositoriesAndBuses(container);
    this.registerApplicationServicesAndRoutes(container);
    this.registerOperationalInfrastructure(container);
    this.registerConfiguredRegistrations(container, inputs.appConfig);
    const credentialTypes = this.collectCredentialTypes(inputs.appConfig);
    await this.applyPlugins(container, inputs.appConfig, credentialTypes);
    const ownership = await this.registerRuntimeInfrastructure(container, inputs.appConfig);
    this.registerCredentialTypes(container, credentialTypes);
    this.synchronizeLiveWorkflowRepository(container, inputs.appConfig.workflows);
    container.resolve(BootRuntimeSnapshotHolder).set(this.createRuntimeSummary(inputs.appConfig));
    container.registerInstance(
      AppContainerLifecycle,
      new AppContainerLifecycle(container, ownership.ownedPrismaClient),
    );
    return container;
  }

  private collectCredentialTypes(appConfig: AppConfig): Array<CredentialType<any, any, unknown>> {
    const credentialTypes = [...appConfig.credentialTypes];
    const openAiCredentialType = new OpenAiApiKeyCredentialTypeFactory(
      new OpenAiApiKeyCredentialHealthTester(globalThis.fetch),
    ).createCredentialType();
    if (!credentialTypes.some((entry) => entry.definition.typeId === openAiCredentialType.definition.typeId)) {
      credentialTypes.push(openAiCredentialType);
    }
    return credentialTypes;
  }

  private async applyPlugins(
    container: Container,
    appConfig: AppConfig,
    credentialTypes: Array<CredentialType<any, any, unknown>>,
  ): Promise<void> {
    await this.pluginRegistrar.apply({
      plugins: appConfig.plugins,
      container,
      appConfig,
      registerCredentialType: (type) => {
        if (!credentialTypes.some((entry) => entry.definition.typeId === type.definition.typeId)) {
          credentialTypes.push(type);
        }
      },
      loggerFactory: container.resolve(ApplicationTokens.LoggerFactory),
    });
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

  private registerConfiguredRegistrations(container: Container, appConfig: AppConfig): void {
    if (appConfig.containerRegistrations.length === 0) {
      return;
    }
    this.containerRegistrationRegistrar.apply(container, appConfig.containerRegistrations);
  }

  private registerCoreInfrastructure(container: Container, inputs: AppContainerInputs): void {
    container.registerInstance(BootRuntimeSnapshotHolder, new BootRuntimeSnapshotHolder());
    container.registerInstance(ApplicationTokens.AppConfig, inputs.appConfig);
    container.registerInstance(ApplicationTokens.CodemationAuthConfig, inputs.appConfig.auth);
    container.registerInstance(ApplicationTokens.CodemationWhitelabelConfig, inputs.appConfig.whitelabel);
    container.registerInstance(ApplicationTokens.WebSocketPort, inputs.appConfig.webSocketPort);
    container.registerInstance(ApplicationTokens.WebSocketBindHost, inputs.appConfig.webSocketBindHost);
    container.registerInstance(CoreTokens.WebhookBasePath, ApiPaths.webhooks());
    container.registerInstance(PersistedWorkflowTokenRegistry, new PersistedWorkflowTokenRegistry());
    container.registerInstance(
      CoreTokens.PersistedWorkflowTokenRegistry,
      container.resolve(PersistedWorkflowTokenRegistry),
    );
    container.register(CredentialTypeRegistryImpl, {
      useFactory: instanceCachingFactory(() => new CredentialTypeRegistryImpl()),
    });
    container.register(CoreTokens.CredentialTypeRegistry, {
      useFactory: instanceCachingFactory((dependencyContainer) =>
        dependencyContainer.resolve(CredentialTypeRegistryImpl),
      ),
    });
    container.registerSingleton(CodemationIdFactory, CodemationIdFactory);
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
      resolveEngineExecutionLimits: () => inputs.appConfig.engineExecutionLimits,
      workflowPolicyRuntimeDefaults: this.createWorkflowPolicyRuntimeDefaults(inputs.appConfig),
      webhookTriggerMatcherProvider: {
        createMatcher: (dependencyContainer) => {
          const webhookRoutingLogger = dependencyContainer
            .resolve(ServerLoggerFactory)
            .create("codemation.webhooks.routing");
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
    container.registerSingleton(ServerLoggerFactory, ServerLoggerFactory);
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
        if (inputs.sharedWorkflowWebsocketServer) {
          return inputs.sharedWorkflowWebsocketServer;
        }
        return new WorkflowWebsocketServer(
          dependencyContainer.resolve(ApplicationTokens.WebSocketPort),
          dependencyContainer.resolve(ApplicationTokens.WebSocketBindHost),
          dependencyContainer.resolve(ServerLoggerFactory).create("codemation-websocket.server"),
        );
      }),
    });
    container.registerSingleton(PrismaClientFactory, PrismaClientFactory);
    container.registerSingleton(RunIterationProjectionFactory, RunIterationProjectionFactory);
    container.registerSingleton(GetIterationCostQueryHandler, GetIterationCostQueryHandler);
    container.registerSingleton(WorkflowPolicyUiPresentationFactory, WorkflowPolicyUiPresentationFactory);
    container.registerSingleton(WorkflowDefinitionMapper, WorkflowDefinitionMapper);
    container.registerSingleton(RequestToWebhookItemMapper, RequestToWebhookItemMapper);
    container.registerSingleton(WebhookEndpointPathValidator, WebhookEndpointPathValidator);
    container.registerSingleton(CredentialSecretCipher, CredentialSecretCipher);
    container.registerSingleton(CredentialMaterialResolver, CredentialMaterialResolver);
    container.registerSingleton(CredentialFieldEnvOverlayService, CredentialFieldEnvOverlayService);
    container.registerSingleton(CredentialRuntimeMaterialService, CredentialRuntimeMaterialService);
    container.registerSingleton(WorkflowCredentialNodeResolver, WorkflowCredentialNodeResolver);
    container.registerSingleton(CredentialInstanceService, CredentialInstanceService);
    container.registerSingleton(CredentialBindingService, CredentialBindingService);
    container.registerSingleton(WorkflowActivationPreflightRules, WorkflowActivationPreflightRules);
    container.registerSingleton(WorkflowActivationPreflight, WorkflowActivationPreflight);
    container.registerSingleton(CredentialTestService, CredentialTestService);
    container.registerSingleton(CredentialSessionServiceImpl, CredentialSessionServiceImpl);
    if (!inputs.appConfig.hasConfiguredCredentialSessionServiceRegistration) {
      container.register(CoreTokens.CredentialSessionService, { useToken: CredentialSessionServiceImpl });
    }
    container.registerSingleton(OAuth2ProviderRegistry, OAuth2ProviderRegistry);
    container.registerSingleton(OAuth2ConnectService, OAuth2ConnectService);
    container.registerSingleton(CodemationFrontendAuthSnapshotFactory, CodemationFrontendAuthSnapshotFactory);
    container.registerSingleton(FrontendAppConfigFactory, FrontendAppConfigFactory);
    container.registerSingleton(PublicFrontendBootstrapFactory, PublicFrontendBootstrapFactory);
    container.registerSingleton(InternalAuthBootstrapFactory, InternalAuthBootstrapFactory);
    container.registerSingleton(DatabaseMigrations, DatabaseMigrations);
    container.registerSingleton(FrontendRuntime, FrontendRuntime);
    container.registerSingleton(WorkerRuntime, WorkerRuntime);
    container.registerSingleton(DevelopmentSessionBypassVerifier, DevelopmentSessionBypassVerifier);
    container.registerSingleton(SecureRequestDetector, SecureRequestDetector);
    container.registerSingleton(InAppCallbackUrlPolicy, InAppCallbackUrlPolicy);
    container.registerSingleton(AuthSessionCookieFactory, AuthSessionCookieFactory);
    container.registerSingleton(CodemationBetterAuthBcryptPasswordCodec, CodemationBetterAuthBcryptPasswordCodec);
    container.registerSingleton(CodemationBetterAuthDatabaseOptionsFactory, CodemationBetterAuthDatabaseOptionsFactory);
    container.registerSingleton(UserAccountSessionPolicy, UserAccountSessionPolicy);
    container.register(CodemationBetterAuthBaseUrlPolicy, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) =>
          new CodemationBetterAuthBaseUrlPolicy(
            dependencyContainer.resolve(ServerLoggerFactory).create("codemation.auth.better-auth.base-url"),
          ),
      ),
    });
    container.register(CodemationBetterAuthServerFactory, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) =>
          new CodemationBetterAuthServerFactory(
            dependencyContainer.resolve(ApplicationTokens.AppConfig),
            dependencyContainer.resolve(CodemationBetterAuthDatabaseOptionsFactory),
            dependencyContainer.resolve(CodemationBetterAuthBcryptPasswordCodec),
            dependencyContainer.resolve(UserAccountSessionPolicy),
            dependencyContainer.resolve(CodemationBetterAuthBaseUrlPolicy),
          ),
      ),
    });
    container.register(CodemationBetterAuthRuntime, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        const appConfig = dependencyContainer.resolve<AppConfig>(ApplicationTokens.AppConfig);
        const prismaClient = dependencyContainer.isRegistered(ApplicationTokens.PrismaClient, true)
          ? dependencyContainer.resolve(ApplicationTokens.PrismaClient)
          : undefined;
        return new CodemationBetterAuthRuntime(
          appConfig,
          dependencyContainer.resolve(CodemationBetterAuthServerFactory),
          prismaClient,
        );
      }),
    });
    container.register(BetterAuthApiSessionVerifier, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        const runtime = dependencyContainer.resolve(CodemationBetterAuthRuntime);
        const prismaClient = dependencyContainer.isRegistered(ApplicationTokens.PrismaClient, true)
          ? dependencyContainer.resolve<PrismaDatabaseClient>(ApplicationTokens.PrismaClient)
          : undefined;
        const policy = dependencyContainer.resolve(UserAccountSessionPolicy);
        const eligibility = prismaClient
          ? new PrismaUserAccountSessionEligibilityChecker(prismaClient, policy)
          : undefined;
        return new BetterAuthApiSessionVerifier(runtime, eligibility);
      }),
    });
    container.registerSingleton(CodemationSessionVerifier, CodemationSessionVerifier);
    container.register(ApplicationTokens.SessionVerifier, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        const appConfig = dependencyContainer.resolve<AppConfig>(ApplicationTokens.AppConfig);
        const isPackagedDevRuntime = Boolean(appConfig.env.CODEMATION_RUNTIME_DEV_URL?.trim());
        const isProduction = appConfig.env.NODE_ENV === "production" && !isPackagedDevRuntime;
        const authConfig = appConfig.auth;
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
          return dependencyContainer.resolve(DevelopmentSessionBypassVerifier);
        }
        const secret = appConfig.env.AUTH_SECRET ?? "";
        if (!secret) {
          throw new Error(
            "AUTH_SECRET is required unless CodemationAuthConfig.allowUnauthenticatedInDevelopment is enabled in a non-production environment.",
          );
        }
        return dependencyContainer.resolve(CodemationSessionVerifier);
      }),
    });
    container.register(UserAccountService, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        const appConfig = dependencyContainer.resolve<AppConfig>(ApplicationTokens.AppConfig);
        const prisma = dependencyContainer.isRegistered(ApplicationTokens.PrismaClient, true)
          ? dependencyContainer.resolve(ApplicationTokens.PrismaClient)
          : undefined;
        return new UserAccountService(appConfig.auth, prisma, dependencyContainer.resolve(UserAccountSessionPolicy));
      }),
    });
  }

  private registerRepositoriesAndBuses(container: Container): void {
    container.registerSingleton(OtelIdentityFactory, OtelIdentityFactory);
    container.registerSingleton(TelemetryPrivacyPolicy, TelemetryPrivacyPolicy);
    container.registerSingleton(TelemetryEnricherChain, TelemetryEnricherChain);
    container.registerSingleton(TelemetryRetentionTimestampFactory, TelemetryRetentionTimestampFactory);
    container.registerSingleton(TelemetryQueryService, TelemetryQueryService);
    container.registerSingleton(NoOpTelemetryExporter, NoOpTelemetryExporter);
    container.register(CompositeTelemetryExporter, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) => new CompositeTelemetryExporter([dependencyContainer.resolve(NoOpTelemetryExporter)]),
      ),
    });
    container.registerSingleton(OtelExecutionTelemetryFactory, OtelExecutionTelemetryFactory);
    container.registerSingleton(InMemoryRunTraceContextRepository, InMemoryRunTraceContextRepository);
    container.registerSingleton(InMemoryTelemetrySpanStore, InMemoryTelemetrySpanStore);
    container.registerSingleton(InMemoryTelemetryArtifactStore, InMemoryTelemetryArtifactStore);
    container.registerSingleton(InMemoryTelemetryMetricPointStore, InMemoryTelemetryMetricPointStore);
    container.registerSingleton(PrismaRunTraceContextRepository, PrismaRunTraceContextRepository);
    container.registerSingleton(PrismaTelemetrySpanStore, PrismaTelemetrySpanStore);
    container.registerSingleton(PrismaTelemetryArtifactStore, PrismaTelemetryArtifactStore);
    container.registerSingleton(PrismaTelemetryMetricPointStore, PrismaTelemetryMetricPointStore);
    container.registerSingleton(WorkflowDefinitionRepositoryAdapter, WorkflowDefinitionRepositoryAdapter);
    container.registerSingleton(InMemoryWorkflowRunRepository, InMemoryWorkflowRunRepository);
    container.registerSingleton(InMemoryTriggerSetupStateRepository, InMemoryTriggerSetupStateRepository);
    container.registerSingleton(InMemoryCredentialStore, InMemoryCredentialStore);
    container.registerSingleton(SqlWorkflowRunRepository, SqlWorkflowRunRepository);
    container.registerSingleton(InMemoryWorkflowDebuggerOverlayRepository, InMemoryWorkflowDebuggerOverlayRepository);
    container.registerSingleton(PrismaTriggerSetupStateRepository, PrismaTriggerSetupStateRepository);
    container.registerSingleton(PrismaWorkflowDebuggerOverlayRepository, PrismaWorkflowDebuggerOverlayRepository);
    container.registerSingleton(PrismaWorkflowActivationRepository, PrismaWorkflowActivationRepository);
    container.registerSingleton(InMemoryWorkflowActivationRepository, InMemoryWorkflowActivationRepository);
    container.registerSingleton(PrismaCredentialStore, PrismaCredentialStore);
    container.register(ApplicationTokens.WorkflowDefinitionRepository, {
      useFactory: instanceCachingFactory(
        (dependencyContainer) =>
          dependencyContainer.resolve(WorkflowDefinitionRepositoryAdapter) as unknown as WorkflowDefinitionRepository,
      ),
    });
    container.registerSingleton(InMemoryQueryBus, InMemoryQueryBus);
    container.registerSingleton(InMemoryCommandBus, InMemoryCommandBus);
    container.registerSingleton(InMemoryDomainEventBus, InMemoryDomainEventBus);
    for (const handler of AppContainerFactory.queryHandlers) {
      container.registerSingleton(ApplicationTokens.QueryHandler, handler);
    }
    for (const handler of AppContainerFactory.commandHandlers) {
      container.registerSingleton(ApplicationTokens.CommandHandler, handler);
    }
    container.register(ApplicationTokens.QueryBus, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(InMemoryQueryBus)),
    });
    container.register(ApplicationTokens.CommandBus, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(InMemoryCommandBus)),
    });
    container.register(ApplicationTokens.DomainEventBus, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(InMemoryDomainEventBus)),
    });
    container.register(ApplicationTokens.TelemetryExporter, {
      useFactory: instanceCachingFactory((dependencyContainer) =>
        dependencyContainer.resolve(CompositeTelemetryExporter),
      ),
    });
  }

  private registerApplicationServicesAndRoutes(container: Container): void {
    container.registerSingleton(DevBootstrapSummaryAssembler, DevBootstrapSummaryAssembler);
    container.registerSingleton(DevBootstrapSummaryHttpRouteHandler, DevBootstrapSummaryHttpRouteHandler);
    container.registerSingleton(AuthHttpRouteHandler, AuthHttpRouteHandler);
    container.registerSingleton(PublicFrontendBootstrapHttpRouteHandler, PublicFrontendBootstrapHttpRouteHandler);
    container.registerSingleton(InternalAuthBootstrapHttpRouteHandler, InternalAuthBootstrapHttpRouteHandler);
    container.registerSingleton(WhitelabelLogoHttpRouteHandler, WhitelabelLogoHttpRouteHandler);
    for (const registrar of AppContainerFactory.honoRouteRegistrars) {
      container.registerSingleton(ApplicationTokens.HonoApiRouteRegistrar, registrar);
    }
    container.registerSingleton(CodemationHonoApiApp, CodemationHonoApiApp);
  }

  private registerOperationalInfrastructure(container: Container): void {
    container.register(ApplicationTokens.WorkflowWebsocketPublisher, {
      useFactory: instanceCachingFactory((dependencyContainer) => dependencyContainer.resolve(WorkflowWebsocketServer)),
    });
    container.registerSingleton(WorkflowRunEventWebsocketRelay, WorkflowRunEventWebsocketRelay);
    container.registerSingleton(RunEventBusTelemetryReporter, RunEventBusTelemetryReporter);
    container.registerSingleton(WorkflowRunRetentionPruneScheduler, WorkflowRunRetentionPruneScheduler);
  }

  private async registerRuntimeInfrastructure(container: Container, appConfig: AppConfig): Promise<PrismaOwnership> {
    const queuePrefix = appConfig.scheduler.queuePrefix ?? appConfig.eventing.queuePrefix ?? "codemation";
    const eventBus =
      appConfig.eventing.kind === "redis"
        ? new RedisRunEventBus(this.requireRedisUrl(appConfig.eventing.redisUrl), queuePrefix)
        : new InMemoryRunEventBus();
    container.registerInstance(CoreTokens.RunEventBus, eventBus);
    const binaryStorage = this.createBinaryStorage(appConfig.repoRoot);
    container.registerInstance(CoreTokens.RunDataFactory, new InMemoryRunDataFactory());
    container.registerInstance(CoreTokens.BinaryStorage, binaryStorage);
    container.registerInstance(ApplicationTokens.Clock, new SystemClock());

    if (appConfig.persistence.kind === "none") {
      const workflowRunRepository = container.resolve(InMemoryWorkflowRunRepository);
      container.registerInstance(
        CoreTokens.WorkflowExecutionRepository,
        new EventPublishingWorkflowExecutionRepository(workflowRunRepository, eventBus),
      );
      container.registerInstance(
        CoreTokens.TriggerSetupStateRepository,
        container.resolve(InMemoryTriggerSetupStateRepository),
      );
      container.registerInstance(ApplicationTokens.WorkflowRunRepository, workflowRunRepository);
      container.registerInstance(
        ApplicationTokens.WorkflowDebuggerOverlayRepository,
        container.resolve(InMemoryWorkflowDebuggerOverlayRepository) as unknown as WorkflowDebuggerOverlayRepository,
      );
      container.registerInstance(
        ApplicationTokens.WorkflowActivationRepository,
        container.resolve(InMemoryWorkflowActivationRepository),
      );
      container.registerInstance(ApplicationTokens.CredentialStore, container.resolve(InMemoryCredentialStore));
      container.registerInstance(
        ApplicationTokens.RunTraceContextRepository,
        container.resolve(InMemoryRunTraceContextRepository),
      );
      container.registerInstance(ApplicationTokens.TelemetrySpanStore, container.resolve(InMemoryTelemetrySpanStore));
      container.registerInstance(
        ApplicationTokens.TelemetryArtifactStore,
        container.resolve(InMemoryTelemetryArtifactStore),
      );
      container.registerInstance(
        ApplicationTokens.TelemetryMetricPointStore,
        container.resolve(InMemoryTelemetryMetricPointStore),
      );
      container.registerInstance(
        CoreTokens.ExecutionContextFactory,
        new DefaultExecutionContextFactory(
          binaryStorage,
          new LazyExecutionTelemetryFactory(() => container.resolve(OtelExecutionTelemetryFactory)),
          new CatalogBackedCostTrackingTelemetryFactory(new StaticCostCatalog(FrameworkCostCatalogEntries)),
        ),
      );
      this.registerRuntimeNodeActivationScheduler(container);
      return {
        ownedPrismaClient: null,
      };
    }

    const prismaOwnership = await this.resolvePrismaOwnership(container, appConfig);
    const childContainer = container.createChildContainer();
    childContainer.registerInstance(PrismaDatabaseClientToken, prismaOwnership.prismaClient);
    const workflowRunRepository = childContainer.resolve(PrismaWorkflowRunRepository);
    const triggerSetupStateRepository = childContainer.resolve(PrismaTriggerSetupStateRepository);
    const workflowDebuggerOverlayRepository = childContainer.resolve(PrismaWorkflowDebuggerOverlayRepository);
    const runTraceContextRepository = childContainer.resolve(PrismaRunTraceContextRepository);
    const telemetrySpanStore = childContainer.resolve(PrismaTelemetrySpanStore);
    const telemetryArtifactStore = childContainer.resolve(PrismaTelemetryArtifactStore);
    const telemetryMetricPointStore = childContainer.resolve(PrismaTelemetryMetricPointStore);
    container.registerInstance(PrismaDatabaseClientToken, prismaOwnership.prismaClient);
    container.registerInstance(ApplicationTokens.PrismaClient, prismaOwnership.prismaClient);
    container.registerInstance(
      CoreTokens.WorkflowExecutionRepository,
      new EventPublishingWorkflowExecutionRepository(workflowRunRepository, eventBus),
    );
    container.registerInstance(CoreTokens.TriggerSetupStateRepository, triggerSetupStateRepository);
    container.registerInstance(ApplicationTokens.WorkflowRunRepository, workflowRunRepository);
    container.registerInstance(
      ApplicationTokens.WorkflowDebuggerOverlayRepository,
      workflowDebuggerOverlayRepository as unknown as WorkflowDebuggerOverlayRepository,
    );
    container.registerInstance(
      ApplicationTokens.WorkflowActivationRepository,
      container.resolve(PrismaWorkflowActivationRepository),
    );
    container.registerInstance(ApplicationTokens.CredentialStore, container.resolve(PrismaCredentialStore));
    container.registerInstance(ApplicationTokens.RunTraceContextRepository, runTraceContextRepository);
    container.registerInstance(ApplicationTokens.TelemetrySpanStore, telemetrySpanStore);
    container.registerInstance(ApplicationTokens.TelemetryArtifactStore, telemetryArtifactStore);
    container.registerInstance(ApplicationTokens.TelemetryMetricPointStore, telemetryMetricPointStore);
    container.registerInstance(
      CoreTokens.ExecutionContextFactory,
      new DefaultExecutionContextFactory(
        binaryStorage,
        new LazyExecutionTelemetryFactory(() => container.resolve(OtelExecutionTelemetryFactory)),
        new CatalogBackedCostTrackingTelemetryFactory(new StaticCostCatalog(FrameworkCostCatalogEntries)),
      ),
    );
    if (appConfig.scheduler.kind === "bullmq") {
      container.registerInstance(
        ApplicationTokens.WorkerRuntimeScheduler,
        new BullmqScheduler({ url: this.requireRedisUrl(appConfig.scheduler.redisUrl) }, queuePrefix),
      );
    }
    this.registerRuntimeNodeActivationScheduler(container);
    return {
      ownedPrismaClient: prismaOwnership.ownedPrismaClient,
    };
  }

  private async resolvePrismaOwnership(
    container: Container,
    appConfig: AppConfig,
  ): Promise<Readonly<{ prismaClient: PrismaDatabaseClient; ownedPrismaClient: PrismaDatabaseClient | null }>> {
    if (container.isRegistered(ApplicationTokens.PrismaClient, true)) {
      return {
        prismaClient: container.resolve(ApplicationTokens.PrismaClient),
        ownedPrismaClient: null,
      };
    }
    const factory = container.resolve(PrismaClientFactory);
    if (appConfig.persistence.kind === "postgresql") {
      const prismaClient = factory.createPostgres(appConfig.persistence.databaseUrl);
      return {
        prismaClient,
        ownedPrismaClient: prismaClient,
      };
    }
    if (appConfig.persistence.kind !== "sqlite") {
      throw new Error("Unexpected database persistence mode for Prisma.");
    }
    const prismaClient = factory.createSqlite(appConfig.persistence.databaseFilePath);
    return {
      prismaClient,
      ownedPrismaClient: prismaClient,
    };
  }

  private registerRuntimeNodeActivationScheduler(container: Container): void {
    container.register(CoreTokens.NodeActivationScheduler, {
      useFactory: instanceCachingFactory((dependencyContainer) => {
        const inlineScheduler = dependencyContainer.resolve(InlineDrivingScheduler);
        if (!dependencyContainer.isRegistered(ApplicationTokens.WorkerRuntimeScheduler, true)) {
          return inlineScheduler;
        }
        return new DefaultDrivingScheduler(
          new ConfigDrivenOffloadPolicy(),
          dependencyContainer.resolve(ApplicationTokens.WorkerRuntimeScheduler),
          inlineScheduler,
        );
      }),
    });
  }

  private createWorkflowPolicyRuntimeDefaults(appConfig: AppConfig): WorkflowPolicyRuntimeDefaults {
    return {
      retentionSeconds: this.readPositiveInteger(appConfig.env.CODEMATION_RUN_RETENTION_DEFAULT_SECONDS),
      binaryRetentionSeconds: this.readPositiveInteger(appConfig.env.CODEMATION_BINARY_RETENTION_DEFAULT_SECONDS),
      telemetrySpanRetentionSeconds: this.readPositiveInteger(
        appConfig.env.CODEMATION_TELEMETRY_SPAN_RETENTION_DEFAULT_SECONDS,
      ),
      telemetryArtifactRetentionSeconds: this.readPositiveInteger(
        appConfig.env.CODEMATION_TELEMETRY_ARTIFACT_RETENTION_DEFAULT_SECONDS,
      ),
      telemetryMetricRetentionSeconds: this.readPositiveInteger(
        appConfig.env.CODEMATION_TELEMETRY_METRIC_RETENTION_DEFAULT_SECONDS,
      ),
    };
  }

  private createBinaryStorage(repoRoot: string): InMemoryBinaryStorage | LocalFilesystemBinaryStorage {
    if (!repoRoot) {
      return new InMemoryBinaryStorage();
    }
    return new LocalFilesystemBinaryStorage(`${repoRoot}/.codemation/binary`);
  }

  private createRuntimeSummary(appConfig: AppConfig): BootRuntimeSummary {
    return {
      databasePersistence: appConfig.persistence,
      eventBusKind: appConfig.eventing.kind,
      plugins: appConfig.pluginLoadSummary ?? [],
      queuePrefix: appConfig.scheduler.queuePrefix ?? appConfig.eventing.queuePrefix ?? "codemation",
      schedulerKind: appConfig.scheduler.kind,
      redisUrl: appConfig.scheduler.redisUrl ?? appConfig.eventing.redisUrl,
    };
  }

  private requireRedisUrl(redisUrl: string | undefined): string {
    if (!redisUrl) {
      throw new Error("Redis-backed runtime requires runtime.eventBus.redisUrl or REDIS_URL.");
    }
    return redisUrl;
  }

  private readPositiveInteger(value: string | undefined): number | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  private synchronizeLiveWorkflowRepository(container: Container, workflows: ReadonlyArray<WorkflowDefinition>): void {
    const liveWorkflowRepository = container.resolve(CoreTokens.LiveWorkflowRepository);
    liveWorkflowRepository.setWorkflows(workflows);
    if (container.isRegistered(WebhookEndpointPathValidator, true)) {
      container.resolve(WebhookEndpointPathValidator).validateAndWarn(workflows);
    }
  }
}
