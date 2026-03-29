import "reflect-metadata";

import type { Container, WorkflowDefinition } from "@codemation/core";
import { CoreTokens } from "@codemation/core";
import type { BootRuntimeSummary } from "./application/dev/BootRuntimeSummary.types";
import "./application/commands/CopyRunToWorkflowDebuggerCommandHandler";
import "./application/commands/CredentialCommandHandlers";
import "./application/commands/HandleWebhookInvocationCommandHandler";
import "./application/commands/ReplayWorkflowNodeCommandHandler";
import "./application/commands/ReplaceMutableRunWorkflowSnapshotCommandHandler";
import "./application/commands/ReplaceWorkflowDebuggerOverlayCommandHandler";
import "./application/commands/SetPinnedNodeInputCommandHandler";
import "./application/commands/SetWorkflowActivationCommandHandler";
import "./application/commands/StartWorkflowRunCommandHandler";
import "./application/commands/UploadOverlayPinnedBinaryCommandHandler";
import "./application/commands/UserAccountCommandHandlers";
import "./application/queries/CredentialQueryHandlers";
import "./application/queries/GetRunBinaryAttachmentQueryHandler";
import "./application/queries/GetRunStateQueryHandler";
import "./application/queries/GetWorkflowDebuggerOverlayQueryHandler";
import "./application/queries/GetWorkflowDetailQueryHandler";
import "./application/queries/GetWorkflowOverlayBinaryAttachmentQueryHandler";
import "./application/queries/GetWorkflowSummariesQueryHandler";
import "./application/queries/ListWorkflowRunsQueryHandler";
import "./application/queries/UserAccountQueryHandlers";
import "./application/binary/OverlayPinnedBinaryUploadService";
import "./presentation/http/hono/registrars/BinaryHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/CredentialHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/DevHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/OAuth2HonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/RunHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/UserHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/WebhookHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/WhitelabelHonoApiRouteRegistrar";
import "./presentation/http/hono/registrars/WorkflowHonoApiRouteRegistrar";
import "./presentation/http/routeHandlers/BinaryHttpRouteHandlerFactory";
import "./presentation/http/routeHandlers/CredentialHttpRouteHandler";
import "./presentation/http/routeHandlers/OAuth2HttpRouteHandlerFactory";
import "./presentation/http/routeHandlers/RunHttpRouteHandler";
import "./presentation/http/routeHandlers/UserHttpRouteHandlerFactory";
import "./presentation/http/routeHandlers/WebhookHttpRouteHandler";
import "./presentation/http/routeHandlers/WorkflowHttpRouteHandler";
import { logLevelPolicyFactory } from "./infrastructure/logging/LogLevelPolicyFactory";
import { FrameworkBuiltinCredentialTypesRegistrar } from "./infrastructure/credentials/FrameworkBuiltinCredentialTypesRegistrar";
import { OpenAiApiKeyCredentialHealthTester } from "./infrastructure/credentials/OpenAiApiKeyCredentialHealthTester";
import { OpenAiApiKeyCredentialTypeFactory } from "./infrastructure/credentials/OpenAiApiKeyCredentialTypeFactory";
import { CodemationPluginRegistrar } from "./infrastructure/config/CodemationPluginRegistrar";
import type { CredentialType } from "./domain/credentials/CredentialServices";
import { CredentialTypeRegistryImpl } from "./domain/credentials/CredentialServices";
import type { CodemationAuthConfig } from "./presentation/config/CodemationAuthConfig";
import type { CodemationApplicationRuntimeConfig, CodemationConfig } from "./presentation/config/CodemationConfig";
import type { NormalizedCodemationConfig } from "./presentation/config/CodemationConfigNormalizer";
import { CodemationConfigNormalizer } from "./presentation/config/CodemationConfigNormalizer";
import type { CodemationPlugin } from "./presentation/config/CodemationPlugin";
import type { CodemationWhitelabelConfig } from "./presentation/config/CodemationWhitelabelConfig";
import { WorkflowWebsocketServer } from "./presentation/websocket/WorkflowWebsocketServer";
import { ApplicationTokens } from "./applicationTokens";
import { CodemationBootstrapRequest } from "./bootstrap/CodemationBootstrapRequest";
import type { CodemationContainerRegistration } from "./bootstrap/CodemationContainerRegistration";
import { CodemationFrontendBootstrapRequest } from "./bootstrap/CodemationFrontendBootstrapRequest";
import { PreparedCodemationRuntime } from "./bootstrap/PreparedCodemationRuntime";
import { PreparedCodemationRuntimeFactory } from "./bootstrap/PreparedCodemationRuntimeFactory";
import { CodemationContainerFactory } from "./bootstrap/CodemationContainerFactory";
import { CodemationWorkerBootstrapRequest } from "./bootstrap/CodemationWorkerBootstrapRequest";
import { AppConfigFactory } from "./bootstrap/runtime/AppConfigFactory";
import { CliRuntimeBootService } from "./bootstrap/boot/CliRuntimeBootService";
import { FrontendRuntimeBootService } from "./bootstrap/boot/FrontendRuntimeBootService";
import { WorkerRuntimeBootService } from "./bootstrap/boot/WorkerRuntimeBootService";

type StopHandle = Readonly<{ stop: () => Promise<void> }>;

export type CodemationStopHandle = StopHandle;

export type CodemationApplicationConfig = CodemationConfig;

export class CodemationApplication {
  private readonly pluginRegistrar: CodemationPluginRegistrar;
  private readonly containerFactory: CodemationContainerFactory;
  private readonly preparedRuntimeFactory: PreparedCodemationRuntimeFactory;
  private readonly configNormalizer: CodemationConfigNormalizer;
  private readonly appConfigFactory: AppConfigFactory;
  private readonly cliRuntimeBootService: CliRuntimeBootService;
  private readonly frontendRuntimeBootService: FrontendRuntimeBootService;
  private readonly workerRuntimeBootService: WorkerRuntimeBootService;

  private configuredContainer: Container | null = null;
  private preparedRuntime: PreparedCodemationRuntime | null = null;
  private workflows: WorkflowDefinition[] = [];
  private runtimeConfig: CodemationApplicationRuntimeConfig = {};
  private containerRegistrations: ReadonlyArray<CodemationContainerRegistration<unknown>> = [];
  private hasConfiguredCredentialSessionServiceRegistration = false;
  private plugins: ReadonlyArray<CodemationPlugin> = [];
  private sharedWorkflowWebsocketServer: WorkflowWebsocketServer | null = null;
  private applicationAuthConfig: CodemationAuthConfig | undefined;
  private whitelabelConfig: CodemationWhitelabelConfig = {};
  private frameworkBuiltinCredentialTypesRegistered = false;
  private credentialTypes: Array<CredentialType<any, any, unknown>> = [];

  constructor(
    pluginRegistrar: CodemationPluginRegistrar = new CodemationPluginRegistrar(),
    containerFactory: CodemationContainerFactory = new CodemationContainerFactory(),
    preparedRuntimeFactory: PreparedCodemationRuntimeFactory = new PreparedCodemationRuntimeFactory(),
    configNormalizer: CodemationConfigNormalizer = new CodemationConfigNormalizer(),
    appConfigFactory: AppConfigFactory = new AppConfigFactory(),
    cliRuntimeBootService: CliRuntimeBootService = new CliRuntimeBootService(),
    frontendRuntimeBootService: FrontendRuntimeBootService = new FrontendRuntimeBootService(),
    workerRuntimeBootService: WorkerRuntimeBootService = new WorkerRuntimeBootService(),
  ) {
    this.pluginRegistrar = pluginRegistrar;
    this.containerFactory = containerFactory;
    this.preparedRuntimeFactory = preparedRuntimeFactory;
    this.configNormalizer = configNormalizer;
    this.appConfigFactory = appConfigFactory;
    this.cliRuntimeBootService = cliRuntimeBootService;
    this.frontendRuntimeBootService = frontendRuntimeBootService;
    this.workerRuntimeBootService = workerRuntimeBootService;
  }

  useConfig(config: CodemationApplicationConfig): this {
    const normalizedConfig: NormalizedCodemationConfig = this.configNormalizer.normalize(config);
    logLevelPolicyFactory.create().applyCodemationLogConfig(normalizedConfig.log);
    if (normalizedConfig.workflows) {
      this.useWorkflows(normalizedConfig.workflows);
    }
    this.useContainerRegistrations(normalizedConfig.containerRegistrations);
    if (!this.frameworkBuiltinCredentialTypesRegistered) {
      new FrameworkBuiltinCredentialTypesRegistrar(
        new OpenAiApiKeyCredentialTypeFactory(new OpenAiApiKeyCredentialHealthTester(globalThis.fetch)),
      ).register(this, normalizedConfig);
      this.frameworkBuiltinCredentialTypesRegistered = true;
    }
    if (normalizedConfig.credentialTypes) {
      for (const credentialType of normalizedConfig.credentialTypes) {
        this.registerCredentialType(credentialType);
      }
    }
    if (normalizedConfig.plugins) {
      this.usePlugins(normalizedConfig.plugins);
    }
    if (normalizedConfig.runtime) {
      this.useRuntimeConfig(normalizedConfig.runtime);
    }
    if (normalizedConfig.auth !== undefined) {
      this.applicationAuthConfig = normalizedConfig.auth;
    }
    this.whitelabelConfig = normalizedConfig.whitelabel ?? {};
    return this;
  }

  useWorkflows(workflows: ReadonlyArray<WorkflowDefinition>): this {
    this.workflows = [...workflows];
    this.invalidatePreparedState();
    return this;
  }

  useRuntimeConfig(runtimeConfig: CodemationApplicationRuntimeConfig): this {
    this.runtimeConfig = {
      ...this.runtimeConfig,
      ...runtimeConfig,
      ...(runtimeConfig.engineExecutionLimits !== undefined
        ? {
            engineExecutionLimits: {
              ...this.runtimeConfig.engineExecutionLimits,
              ...runtimeConfig.engineExecutionLimits,
            },
          }
        : {}),
    };
    this.invalidatePreparedState();
    return this;
  }

  private useContainerRegistrations(registrations: ReadonlyArray<CodemationContainerRegistration<unknown>>): this {
    this.containerRegistrations = [...registrations];
    this.hasConfiguredCredentialSessionServiceRegistration = registrations.some(
      (entry) => entry.token === CoreTokens.CredentialSessionService,
    );
    this.invalidatePreparedState();
    return this;
  }

  usePlugins(plugins: ReadonlyArray<CodemationPlugin>): this {
    this.plugins = [...plugins];
    return this;
  }

  useSharedWorkflowWebsocketServer(workflowWebsocketServer: WorkflowWebsocketServer): this {
    this.sharedWorkflowWebsocketServer = workflowWebsocketServer;
    if (this.configuredContainer) {
      this.configuredContainer.registerInstance(WorkflowWebsocketServer, workflowWebsocketServer);
      this.configuredContainer.registerInstance(ApplicationTokens.WorkflowWebsocketPublisher, workflowWebsocketServer);
    }
    return this;
  }

  getRuntimeConfig(): CodemationApplicationRuntimeConfig {
    return { ...this.runtimeConfig };
  }

  getWorkflows(): ReadonlyArray<WorkflowDefinition> {
    return [...this.workflows];
  }

  getContainer(): Container {
    return this.ensureConfiguredContainer();
  }

  getBootRuntimeSummary(): BootRuntimeSummary | null {
    return this.preparedRuntime?.runtimeSummary ?? null;
  }

  registerCredentialType(type: CredentialType<any, any, unknown>): void {
    if (this.credentialTypes.some((entry) => entry.definition.typeId === type.definition.typeId)) {
      return;
    }
    this.credentialTypes.push(type);
    if (this.configuredContainer) {
      this.configuredContainer.resolve(CredentialTypeRegistryImpl).register(type);
    }
  }

  async applyPlugins(request: CodemationBootstrapRequest): Promise<void> {
    const container = this.ensureConfiguredContainer();
    const env = request.resolveEnvironment();
    await this.pluginRegistrar.apply({
      plugins: this.plugins,
      container,
      appConfig: this.appConfigFactory.create({
        repoRoot: request.repoRoot,
        consumerRoot: request.consumerRoot,
        env,
        workflowSources: request.workflowSources,
        runtimeConfig: this.runtimeConfig,
        authConfig: this.applicationAuthConfig,
        whitelabelConfig: this.whitelabelConfig,
      }),
      registerCredentialType: (type) => this.registerCredentialType(type),
      loggerFactory: container.resolve(ApplicationTokens.LoggerFactory),
    });
  }

  async prepareContainer(request: CodemationBootstrapRequest): Promise<PreparedCodemationRuntime> {
    if (this.preparedRuntime) {
      return this.preparedRuntime;
    }
    const env = request.resolveEnvironment();
    this.preparedRuntime = await this.preparedRuntimeFactory.prepare({
      container: this.ensureConfiguredContainer(),
      repoRoot: request.repoRoot,
      consumerRoot: request.consumerRoot,
      env,
      workflowSources: request.workflowSources,
      runtimeConfig: this.runtimeConfig,
      applicationAuthConfig: this.applicationAuthConfig,
      whitelabelConfig: this.whitelabelConfig,
      hasConfiguredCredentialSessionServiceRegistration: this.hasConfiguredCredentialSessionServiceRegistration,
    });
    return this.preparedRuntime;
  }

  async bootCli(request: CodemationBootstrapRequest): Promise<PreparedCodemationRuntime> {
    const preparedRuntime = await this.prepareContainer(request);
    await this.cliRuntimeBootService.boot({ preparedRuntime });
    return preparedRuntime;
  }

  async bootFrontend(request: CodemationFrontendBootstrapRequest): Promise<PreparedCodemationRuntime> {
    const preparedRuntime = await this.prepareContainer(request.bootstrap);
    await this.frontendRuntimeBootService.boot({
      preparedRuntime,
      skipPresentationServers: request.skipPresentationServers,
    });
    return preparedRuntime;
  }

  async bootWorker(request: CodemationWorkerBootstrapRequest): Promise<CodemationStopHandle> {
    const preparedRuntime = await this.prepareContainer(request.bootstrap);
    void request.bootstrapSource;
    return await this.workerRuntimeBootService.boot({
      preparedRuntime,
      queues: request.queues,
    });
  }

  async stop(args?: Readonly<{ stopWebsocketServer?: boolean }>): Promise<void> {
    if (!this.preparedRuntime) {
      return;
    }
    await this.preparedRuntime.stop(args);
  }

  private ensureConfiguredContainer(): Container {
    if (this.configuredContainer) {
      return this.configuredContainer;
    }
    this.configuredContainer = this.containerFactory.create({
      application: this,
      registrations: this.containerRegistrations,
      runtimeConfig: this.runtimeConfig,
      workflows: this.workflows,
      credentialTypes: this.credentialTypes,
      sharedWorkflowWebsocketServer: this.sharedWorkflowWebsocketServer,
    });
    return this.configuredContainer;
  }

  private invalidatePreparedState(): void {
    this.configuredContainer = null;
    this.preparedRuntime = null;
  }
}
