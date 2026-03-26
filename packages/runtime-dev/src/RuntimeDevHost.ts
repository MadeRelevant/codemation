import type { Container } from "@codemation/core";
import { CoreTokens, Engine } from "@codemation/core";
import type { CodemationAuthConfig, CodemationPlugin } from "@codemation/host";
import type { Logger } from "@codemation/host/next/server";
import {
  CodemationApplication,
  CodemationPluginListMerger,
  logLevelPolicyFactory,
  ServerLoggerFactory,
  WorkflowWebsocketServer,
} from "@codemation/host/next/server";
import {
  CodemationConsumerConfigLoader,
  CodemationPluginDiscovery,
  type CodemationDiscoveredPluginPackage,
  type CodemationResolvedPluginPackage,
} from "@codemation/host/server";
import { access } from "node:fs/promises";
import path from "node:path";
import { CodemationTsyringeTypeInfoRegistrar } from "@codemation/host/dev-server-sidecar";
import { RuntimeDevMetrics } from "./RuntimeDevMetrics";

export type RuntimeDevHostContext = Readonly<{
  application: CodemationApplication;
  authConfig: CodemationAuthConfig | undefined;
  buildVersion: string;
  consumerRoot: string;
  repoRoot: string;
  workflowSources: ReadonlyArray<string>;
}>;

/**
 * Single-process runtime host for dev: one source load per process. Restarts are handled by the dev gateway.
 */
export class RuntimeDevHost {
  private readonly pluginListMerger = new CodemationPluginListMerger();
  private contextPromise: Promise<RuntimeDevHostContext> | null = null;
  private readonly sharedWorkflowWebsocketServer: WorkflowWebsocketServer;
  private readonly metrics: RuntimeDevMetrics;
  private readonly performanceDiagnosticsLogger: Logger;

  constructor(
    private readonly configLoader: CodemationConsumerConfigLoader,
    private readonly pluginDiscovery: CodemationPluginDiscovery,
    metrics: RuntimeDevMetrics,
  ) {
    this.metrics = metrics;
    const loggerFactory = new ServerLoggerFactory(logLevelPolicyFactory);
    this.performanceDiagnosticsLogger = loggerFactory.createPerformanceDiagnostics("codemation-runtime-dev.timing");
    this.sharedWorkflowWebsocketServer = new WorkflowWebsocketServer(
      this.resolveWebSocketPort(),
      this.resolveWebSocketBindHost(),
      loggerFactory.create("codemation-websocket.server"),
    );
  }

  getMetrics(): RuntimeDevMetrics {
    return this.metrics;
  }

  async prepare(): Promise<RuntimeDevHostContext> {
    if (!this.contextPromise) {
      this.contextPromise = this.createInitialContext();
    }
    return this.contextPromise;
  }

  async getContainer(): Promise<Container> {
    return (await this.prepare()).application.getContainer();
  }

  private async createInitialContext(): Promise<RuntimeDevHostContext> {
    const context = await this.createContext();
    await this.emitInitialDevBootMessages(context);
    return context;
  }

  private async emitInitialDevBootMessages(context: RuntimeDevHostContext): Promise<void> {
    await this.publishBuildLifecycleMessage(context, (workflowId: string) => ({
      kind: "devBuildCompleted",
      workflowId,
      buildVersion: context.buildVersion,
    }));
  }

  private async createContext(): Promise<RuntimeDevHostContext> {
    const createContextStarted = performance.now();
    let mark = createContextStarted;
    const phaseMs = (label: string): void => {
      const now = performance.now();
      const delta = now - mark;
      mark = now;
      this.performanceDiagnosticsLogger.info(
        `createContext.${label} +${delta.toFixed(1)}ms (cumulative ${(now - createContextStarted).toFixed(1)}ms)`,
      );
    };
    const consumerRoot = this.resolveConsumerRoot();
    const repoRoot = await this.detectWorkspaceRoot(consumerRoot);
    phaseMs("detectWorkspaceRoot");
    const prismaCliOverride = await this.resolvePrismaCliOverride();
    const hostPackageRoot = path.resolve(repoRoot, "packages", "host");
    if (prismaCliOverride) {
      process.env.CODEMATION_PRISMA_CLI_PATH = prismaCliOverride;
    }
    process.env.CODEMATION_HOST_PACKAGE_ROOT = hostPackageRoot;
    process.env.CODEMATION_PRISMA_CONFIG_PATH = path.resolve(hostPackageRoot, "prisma.config.ts");
    const configResolution = await this.configLoader.load({ consumerRoot });
    phaseMs("loadConsumerAppFromSource");
    const env = { ...process.env };
    if (prismaCliOverride) {
      env.CODEMATION_PRISMA_CLI_PATH = prismaCliOverride;
    }
    env.CODEMATION_HOST_PACKAGE_ROOT = hostPackageRoot;
    env.CODEMATION_PRISMA_CONFIG_PATH = path.resolve(hostPackageRoot, "prisma.config.ts");
    const application = new CodemationApplication();
    application.useSharedWorkflowWebsocketServer(this.sharedWorkflowWebsocketServer);
    const discoveredPlugins = await this.loadDiscoveredPlugins(consumerRoot);
    phaseMs("discoverPlugins");

    application.useConfig(configResolution.config);
    if (discoveredPlugins.length > 0) {
      application.usePlugins(this.pluginListMerger.merge(configResolution.config.plugins ?? [], discoveredPlugins));
    }
    await application.applyPlugins({
      consumerRoot,
      repoRoot,
      env,
      workflowSources: configResolution.workflowSources,
    });
    phaseMs("applyPlugins");
    await application.prepareFrontendServerContainer({
      repoRoot,
      consumerRoot,
      env,
    });
    phaseMs("prepareFrontendServerContainer");
    const typeInfoRegistrar = new CodemationTsyringeTypeInfoRegistrar(application.getContainer());
    typeInfoRegistrar.registerWorkflowDefinitions(configResolution.config.workflows ?? []);
    typeInfoRegistrar.registerBootHookToken(configResolution.config.bootHook);
    if (process.env.CODEMATION_SKIP_BOOT_HOOK !== "true") {
      await application.applyBootHook({
        bootHookToken: configResolution.config.bootHook,
        consumerRoot,
        repoRoot,
        env,
        workflowSources: configResolution.workflowSources,
      });
    }
    phaseMs("registerTypesAndBootHook");

    const container = application.getContainer();
    const workflowRepository = container.resolve(CoreTokens.WorkflowRepository);
    const engine = container.resolve(Engine);
    await engine.start([...workflowRepository.list()]);
    phaseMs("engine.start");

    return {
      application,
      authConfig: configResolution.config.auth,
      buildVersion: this.createBuildVersion(),
      consumerRoot,
      repoRoot,
      workflowSources: configResolution.workflowSources,
    };
  }

  private async loadDiscoveredPlugins(consumerRoot: string): Promise<ReadonlyArray<CodemationPlugin>> {
    const discoveredPackages = this.resolvePrecomputedPluginPackages();
    const resolvedPackages = discoveredPackages
      ? await this.pluginDiscovery.resolveDiscoveredPackages(discoveredPackages)
      : await this.pluginDiscovery.resolvePlugins(consumerRoot);
    return resolvedPackages.map((resolvedPackage: CodemationResolvedPluginPackage) => resolvedPackage.plugin);
  }

  private resolvePrecomputedPluginPackages(): ReadonlyArray<CodemationDiscoveredPluginPackage> | null {
    const raw = process.env.CODEMATION_DISCOVERED_PLUGIN_PACKAGES_JSON;
    if (!raw || raw.trim().length === 0) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return null;
      }
      return parsed.filter((candidate): candidate is CodemationDiscoveredPluginPackage => {
        if (!candidate || typeof candidate !== "object") {
          return false;
        }
        const packageRecord = candidate as Partial<CodemationDiscoveredPluginPackage>;
        return (
          typeof packageRecord.packageName === "string" &&
          typeof packageRecord.packageRoot === "string" &&
          Boolean(packageRecord.manifest) &&
          packageRecord.manifest?.kind === "plugin" &&
          typeof packageRecord.manifest.entry === "string"
        );
      });
    } catch {
      return null;
    }
  }

  private async detectWorkspaceRoot(startDirectory: string): Promise<string> {
    let currentDirectory = path.resolve(startDirectory);
    while (true) {
      if (await this.exists(path.resolve(currentDirectory, "pnpm-workspace.yaml"))) {
        return currentDirectory;
      }
      const parentDirectory = path.dirname(currentDirectory);
      if (parentDirectory === currentDirectory) {
        return startDirectory;
      }
      currentDirectory = parentDirectory;
    }
  }

  private async resolvePrismaCliOverride(): Promise<string | null> {
    const candidate = path.resolve(process.cwd(), "node_modules", "prisma", "build", "index.js");
    return (await this.exists(candidate)) ? candidate : null;
  }

  private resolveConsumerRoot(): string {
    const configuredPath = process.env.CODEMATION_CONSUMER_ROOT;
    if (!configuredPath || configuredPath.trim().length === 0) {
      throw new Error("Missing CODEMATION_CONSUMER_ROOT.");
    }
    return path.resolve(configuredPath);
  }

  private createBuildVersion(): string {
    return `${Date.now()}-${process.pid}`;
  }

  private async publishBuildLifecycleMessage(
    context: RuntimeDevHostContext,
    createMessage: (workflowId: string) => Parameters<WorkflowWebsocketServer["publishToRoom"]>[1],
  ): Promise<void> {
    const workflowIds = this.resolveWorkflowIds(context);
    if (workflowIds.length === 0) {
      return;
    }
    for (const workflowId of workflowIds) {
      await this.sharedWorkflowWebsocketServer.publishToRoom(workflowId, createMessage(workflowId));
    }
  }

  private resolveWorkflowIds(context: RuntimeDevHostContext): ReadonlyArray<string> {
    return context.application.getWorkflows().map((workflow) => workflow.id);
  }

  private resolveWebSocketPort(): number {
    const rawPort = process.env.CODEMATION_WS_PORT ?? process.env.VITE_CODEMATION_WS_PORT;
    const parsedPort = Number(rawPort);
    if (Number.isInteger(parsedPort) && parsedPort > 0) {
      return parsedPort;
    }
    return 3001;
  }

  private resolveWebSocketBindHost(): string {
    return process.env.CODEMATION_WS_BIND_HOST ?? "0.0.0.0";
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
