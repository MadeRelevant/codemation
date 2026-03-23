import type { Container } from "@codemation/core";
import { CoreTokens, Engine } from "@codemation/core";
import type { CodemationAuthConfig, CodemationPlugin } from "@codemation/host";
import type { Logger } from "@codemation/host/next/server";
import {
  CodemationApplication,
  CodemationPluginListMerger,
  logLevelPolicyFactory,
  ServerLoggerFactory,
  WorkflowDefinitionMapper,
  WorkflowWebsocketServer,
} from "@codemation/host/next/server";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { CodemationTsyringeTypeInfoRegistrar } from "@codemation/host/dev-server-sidecar";
import { RuntimeDevMetrics } from "./RuntimeDevMetrics";
import { RuntimeDevModuleRunner } from "./RuntimeDevModuleRunner";

export type RuntimeDevHostContext = Readonly<{
  application: CodemationApplication;
  authConfig: CodemationAuthConfig | undefined;
  buildVersion: string;
  consumerRoot: string;
  repoRoot: string;
  workflowSources: ReadonlyArray<string>;
}>;

type CodemationConsumerBuildManifest = Readonly<{
  buildVersion: string;
  consumerRoot: string;
  entryPath: string;
  pluginEntryPath: string;
  workflowSourcePaths: ReadonlyArray<string>;
}>;

export class RuntimeDevHost {
  private readonly pluginListMerger = new CodemationPluginListMerger();
  private activeRuntime: { buildVersion: string; contextPromise: Promise<RuntimeDevHostContext> } | null = null;
  private refreshPromise: Promise<RuntimeDevHostContext> | null = null;
  private readonly sharedWorkflowWebsocketServer: WorkflowWebsocketServer;
  private readonly moduleRunner: RuntimeDevModuleRunner;
  private readonly metrics: RuntimeDevMetrics;
  private readonly performanceDiagnosticsLogger: Logger;

  constructor(
    moduleRunner: RuntimeDevModuleRunner,
    metrics: RuntimeDevMetrics,
  ) {
    this.metrics = metrics;
    this.moduleRunner = moduleRunner;
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

  getModuleRunner(): RuntimeDevModuleRunner {
    return this.moduleRunner;
  }

  async prepare(): Promise<RuntimeDevHostContext> {
    const manifest = await this.resolveBuildManifest();
    return await this.ensureRuntimeForManifest(manifest);
  }

  async getContainer(): Promise<Container> {
    return (await this.prepare()).application.getContainer();
  }

  async notifyBuildStarted(args: Readonly<{ buildVersion?: string }> = {}): Promise<void> {
    const activeContext = await this.resolveActiveContext();
    if (!activeContext) {
      return;
    }
    await this.publishBuildLifecycleMessage(activeContext, (workflowId: string) => ({
      kind: "devBuildStarted",
      workflowId,
      buildVersion: args.buildVersion,
    }));
  }

  async notifyBuildCompleted(args: Readonly<{ buildVersion?: string }> = {}): Promise<void> {
    const notifyStarted = performance.now();
    const manifest = await this.resolveBuildManifest();
    const resolveManifestMs = performance.now() - notifyStarted;
    const ensureStarted = performance.now();
    const nextContext = await this.ensureRuntimeForManifest(manifest);
    const ensureRuntimeMs = performance.now() - ensureStarted;
    const publishStarted = performance.now();
    await this.publishBuildLifecycleMessage(nextContext, (workflowId: string) => ({
      kind: "devBuildCompleted",
      workflowId,
      buildVersion: args.buildVersion ?? manifest.buildVersion,
    }));
    const publishLifecycleMs = performance.now() - publishStarted;
    this.performanceDiagnosticsLogger.info(
      `notifyBuildCompleted resolveManifest:${resolveManifestMs.toFixed(1)}ms ensureRuntime:${ensureRuntimeMs.toFixed(1)}ms publishDevBuildCompleted:${publishLifecycleMs.toFixed(1)}ms total:${(performance.now() - notifyStarted).toFixed(1)}ms`,
    );
  }

  async notifyBuildFailed(args: Readonly<{ message: string }>): Promise<void> {
    const activeContext = await this.resolveActiveContext();
    if (!activeContext) {
      return;
    }
    await this.publishBuildLifecycleMessage(activeContext, (workflowId: string) => ({
      kind: "devBuildFailed",
      workflowId,
      message: args.message,
    }));
  }

  private async ensureRuntimeForManifest(manifest: CodemationConsumerBuildManifest): Promise<RuntimeDevHostContext> {
    if (this.activeRuntime?.buildVersion === manifest.buildVersion) {
      return await this.activeRuntime.contextPromise;
    }
    if (this.refreshPromise) {
      await this.refreshPromise.catch(() => null);
      return await this.ensureRuntimeForManifest(manifest);
    }
    this.refreshPromise = this.swapRuntime(manifest);
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async swapRuntime(buildManifest: CodemationConsumerBuildManifest): Promise<RuntimeDevHostContext> {
    const swapStarted = performance.now();
    const previousRuntime = this.activeRuntime;
    const previousContext = previousRuntime ? await previousRuntime.contextPromise.catch(() => null) : null;
    const createContextStarted = performance.now();
    const nextContext = await this.createContext(buildManifest);
    const createContextMs = performance.now() - createContextStarted;
    this.activeRuntime = {
      buildVersion: nextContext.buildVersion,
      contextPromise: Promise.resolve(nextContext),
    };
    let emitWorkflowChangedMs = 0;
    let stopPreviousMs = 0;
    if (previousContext) {
      const emitStarted = performance.now();
      await this.emitWorkflowChangedEvents({
        previousContext,
        nextContext,
      });
      emitWorkflowChangedMs = performance.now() - emitStarted;
      const stopStarted = performance.now();
      await previousContext.application.stopFrontendServerContainer({
        stopWebsocketServer: false,
      });
      stopPreviousMs = performance.now() - stopStarted;
    }
    const swapTotalMs = performance.now() - swapStarted;
    this.metrics.recordEngineSwap(swapTotalMs);
    this.performanceDiagnosticsLogger.info(
      `swapRuntime revision=${buildManifest.buildVersion} createContext:${createContextMs.toFixed(1)}ms emitWorkflowChanged:${emitWorkflowChangedMs.toFixed(1)}ms stopPreviousFrontend:${stopPreviousMs.toFixed(1)}ms total:${swapTotalMs.toFixed(1)}ms`,
    );
    return nextContext;
  }

  private async createContext(buildManifest: CodemationConsumerBuildManifest): Promise<RuntimeDevHostContext> {
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
    const consumerRoot = path.resolve(buildManifest.consumerRoot);
    const repoRoot = await this.detectWorkspaceRoot(consumerRoot);
    phaseMs("detectWorkspaceRoot");
    const prismaCliOverride = await this.resolvePrismaCliOverride();
    const hostPackageRoot = path.resolve(repoRoot, "packages", "host");
    if (prismaCliOverride) {
      process.env.CODEMATION_PRISMA_CLI_PATH = prismaCliOverride;
    }
    process.env.CODEMATION_HOST_PACKAGE_ROOT = hostPackageRoot;
    process.env.CODEMATION_PRISMA_CONFIG_PATH = path.resolve(hostPackageRoot, "prisma.config.ts");
    const revisionRoot = path.dirname(path.resolve(buildManifest.entryPath));
    const resolvedConsumerApp = await this.moduleRunner.loadConsumerApp(revisionRoot);
    phaseMs("loadConsumerApp(includesViteIfNewRevision)");
    const env = { ...process.env };
    if (prismaCliOverride) {
      env.CODEMATION_PRISMA_CLI_PATH = prismaCliOverride;
    }
    env.CODEMATION_HOST_PACKAGE_ROOT = hostPackageRoot;
    env.CODEMATION_PRISMA_CONFIG_PATH = path.resolve(hostPackageRoot, "prisma.config.ts");
    const application = new CodemationApplication();
    application.useSharedWorkflowWebsocketServer(this.sharedWorkflowWebsocketServer);
    const discoveredPlugins = await this.loadDiscoveredPlugins(buildManifest);
    phaseMs("loadDiscoveredPlugins");

    application.useConfig(resolvedConsumerApp.config);
    if (discoveredPlugins.length > 0) {
      application.usePlugins(this.pluginListMerger.merge(resolvedConsumerApp.config.plugins ?? [], discoveredPlugins));
    }
    await application.applyPlugins({
      consumerRoot,
      repoRoot,
      env,
      workflowSources: resolvedConsumerApp.workflowSources,
    });
    phaseMs("applyPlugins");
    await application.prepareFrontendServerContainer({
      repoRoot,
      env,
    });
    phaseMs("prepareFrontendServerContainer");
    const typeInfoRegistrar = new CodemationTsyringeTypeInfoRegistrar(application.getContainer());
    typeInfoRegistrar.registerWorkflowDefinitions(resolvedConsumerApp.config.workflows ?? []);
    typeInfoRegistrar.registerBootHookToken(resolvedConsumerApp.config.bootHook);
    if (process.env.CODEMATION_SKIP_BOOT_HOOK !== "true") {
      await application.applyBootHook({
        bootHookToken: resolvedConsumerApp.config.bootHook,
        consumerRoot,
        repoRoot,
        env,
        workflowSources: resolvedConsumerApp.workflowSources,
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
      authConfig: resolvedConsumerApp.config.auth,
      buildVersion: buildManifest.buildVersion,
      consumerRoot,
      repoRoot,
      workflowSources: resolvedConsumerApp.workflowSources,
    };
  }

  private async loadDiscoveredPlugins(buildManifest: CodemationConsumerBuildManifest): Promise<ReadonlyArray<CodemationPlugin>> {
    const resolvedPath = path.resolve(buildManifest.pluginEntryPath);
    if (!(await this.exists(resolvedPath))) {
      return [];
    }
    return await this.moduleRunner.loadDiscoveredPlugins(resolvedPath);
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

  private async resolveBuildManifest(): Promise<CodemationConsumerBuildManifest> {
    const manifestPath = await this.resolveBuildManifestPath();
    const manifestText = await readFile(manifestPath, "utf8");
    const parsedManifest = JSON.parse(manifestText) as Partial<CodemationConsumerBuildManifest>;
    if (
      typeof parsedManifest.buildVersion !== "string"
      || typeof parsedManifest.consumerRoot !== "string"
      || typeof parsedManifest.entryPath !== "string"
      || typeof parsedManifest.pluginEntryPath !== "string"
      || !Array.isArray(parsedManifest.workflowSourcePaths)
    ) {
      throw new Error(`Invalid Codemation consumer build manifest at ${manifestPath}.`);
    }
    const buildManifest: CodemationConsumerBuildManifest = {
      buildVersion: parsedManifest.buildVersion,
      consumerRoot: path.resolve(parsedManifest.consumerRoot),
      entryPath: path.resolve(parsedManifest.entryPath),
      pluginEntryPath: path.resolve(parsedManifest.pluginEntryPath),
      workflowSourcePaths: parsedManifest.workflowSourcePaths.filter((workflowSourcePath): workflowSourcePath is string => typeof workflowSourcePath === "string"),
    };
    if (!(await this.exists(buildManifest.entryPath))) {
      throw new Error(`Built consumer output not found at ${buildManifest.entryPath}. Run \`codemation build\` before starting the runtime.`);
    }
    if (!(await this.exists(buildManifest.pluginEntryPath))) {
      throw new Error(`Discovered plugins output not found at ${buildManifest.pluginEntryPath}. Run \`codemation build\` before starting the runtime.`);
    }
    return buildManifest;
  }

  private async resolveBuildManifestPath(): Promise<string> {
    const configuredPath = process.env.CODEMATION_CONSUMER_OUTPUT_MANIFEST_PATH;
    if (!configuredPath || configuredPath.trim().length === 0) {
      throw new Error("Missing CODEMATION_CONSUMER_OUTPUT_MANIFEST_PATH.");
    }
    const resolvedPath = path.resolve(configuredPath);
    if (!(await this.exists(resolvedPath))) {
      throw new Error(`Build manifest not found at ${resolvedPath}.`);
    }
    return resolvedPath;
  }

  private async emitWorkflowChangedEvents(args: Readonly<{
    previousContext: RuntimeDevHostContext;
    nextContext: RuntimeDevHostContext;
  }>): Promise<void> {
    const changedWorkflowIds = this.resolveChangedWorkflowIds(args);
    if (changedWorkflowIds.length === 0) {
      return;
    }
    for (const workflowId of changedWorkflowIds) {
      await this.sharedWorkflowWebsocketServer.publishToRoom(workflowId, {
        kind: "workflowChanged",
        workflowId,
      });
    }
  }

  private async resolveActiveContext(): Promise<RuntimeDevHostContext | null> {
    const activeRuntime = this.activeRuntime;
    if (!activeRuntime) {
      return null;
    }
    return await activeRuntime.contextPromise.catch(() => null);
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

  private resolveChangedWorkflowIds(args: Readonly<{
    previousContext: RuntimeDevHostContext;
    nextContext: RuntimeDevHostContext;
  }>): ReadonlyArray<string> {
    const previousWorkflowsById = this.mapWorkflowsById(args.previousContext);
    const nextWorkflowsById = this.mapWorkflowsById(args.nextContext);
    const workflowIds = new Set<string>([
      ...previousWorkflowsById.keys(),
      ...nextWorkflowsById.keys(),
    ]);
    return [...workflowIds].filter((workflowId) => previousWorkflowsById.get(workflowId) !== nextWorkflowsById.get(workflowId));
  }

  private mapWorkflowsById(context: RuntimeDevHostContext): ReadonlyMap<string, string> {
    const mapper = context.application.getContainer().resolve(WorkflowDefinitionMapper);
    const entries = context.application.getWorkflows().map((workflow) => {
      return [workflow.id, JSON.stringify(mapper.mapSync(workflow))] as const;
    });
    return new Map(entries);
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
