import type { Container } from "@codemation/core";
import { CoreTokens,Engine } from "@codemation/core";
import type { CodemationAuthConfig,CodemationPlugin } from "@codemation/host";
import {
CodemationApplication,
CodemationHonoApiApp,
logLevelPolicyFactory,
ServerLoggerFactory,
WorkflowDefinitionMapper,
WorkflowWebsocketServer,
} from "@codemation/host/next/server";
import type { CodemationConsumerApp } from "@codemation/host/server";
import type { Hono } from "hono";
import { access,readFile,stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { CodemationTsyringeTypeInfoRegistrar } from "./CodemationTsyringeTypeInfoRegistrar";
import { DevelopmentRuntimeApi } from "./DevelopmentRuntimeApi";

export type CodemationNextHostContext = Readonly<{
  application: CodemationApplication;
  authConfig: CodemationAuthConfig | undefined;
  buildVersion: string;
  consumerRoot: string;
  repoRoot: string;
  workflowSources: ReadonlyArray<string>;
}>;

type CodemationNextHostGlobal = typeof globalThis & {
  __codemationNextHost__?: CodemationNextHost;
};

type CodemationConsumerBuildManifest = Readonly<{
  buildVersion: string;
  consumerRoot: string;
  entryPath: string;
  pluginEntryPath: string;
  workflowSourcePaths: ReadonlyArray<string>;
}>;

type CodemationActiveRuntime = Readonly<{
  buildVersion: string;
  contextPromise: Promise<CodemationNextHostContext>;
}>;

export class CodemationNextHost {
  private nextApiApp: Hono | null = null;
  private nextApiAppBuildVersion: string | null = null;

  static get shared(): CodemationNextHost {
    const globalState = globalThis as CodemationNextHostGlobal;
    if (!globalState.__codemationNextHost__) {
      globalState.__codemationNextHost__ = new CodemationNextHost();
    }
    return globalState.__codemationNextHost__;
  }

  private activeRuntime: CodemationActiveRuntime | null = null;
  private refreshPromise: Promise<CodemationNextHostContext> | null = null;
  private sharedWorkflowWebsocketServer: WorkflowWebsocketServer | null = null;

  async prepare(): Promise<CodemationNextHostContext> {
    const manifest = await this.resolveBuildManifest();
    return await this.ensureRuntimeForManifest(manifest);
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
    const activeContext = await this.resolveActiveContext();
    if (!activeContext) {
      return;
    }
    const manifest = await this.resolveBuildManifest();
    const nextContext = await this.ensureRuntimeForManifest(manifest);
    await this.publishBuildLifecycleMessage(nextContext, (workflowId: string) => ({
      kind: "devBuildCompleted",
      workflowId,
      buildVersion: args.buildVersion ?? manifest.buildVersion,
    }));
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

  private async ensureRuntimeForManifest(manifest: CodemationConsumerBuildManifest): Promise<CodemationNextHostContext> {
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

  async getContainer(): Promise<Container> {
    return (await this.prepare()).application.getContainer();
  }

  /**
   * Handles all `/api/**` traffic. Next.js forwards the incoming Request; Hono does not listen on a port.
   */
  async fetchApi(request: Request): Promise<Response> {
    const context = await this.prepare();
    const app = this.resolveNextApiApp(context);
    return app.fetch(request);
  }

  private resolveNextApiApp(context: CodemationNextHostContext): Hono {
    if (this.nextApiApp && this.nextApiAppBuildVersion === context.buildVersion) {
      return this.nextApiApp;
    }
    const coreApp = context.application.getContainer().resolve(CodemationHonoApiApp).getHono();
    DevelopmentRuntimeApi.attach(coreApp, this);
    this.nextApiApp = coreApp;
    this.nextApiAppBuildVersion = context.buildVersion;
    return coreApp;
  }

  private resetNextApiApp(): void {
    this.nextApiApp = null;
    this.nextApiAppBuildVersion = null;
  }

  private async createContext(buildManifest: CodemationConsumerBuildManifest): Promise<CodemationNextHostContext> {
    const consumerRoot = path.resolve(buildManifest.consumerRoot);
    const repoRoot = await this.detectWorkspaceRoot(consumerRoot);
    const prismaCliOverride = await this.resolvePrismaCliOverride();
    const hostPackageRoot = path.resolve(repoRoot, "packages", "host");
    if (prismaCliOverride) {
      process.env.CODEMATION_PRISMA_CLI_PATH = prismaCliOverride;
    }
    process.env.CODEMATION_HOST_PACKAGE_ROOT = hostPackageRoot;
    process.env.CODEMATION_PRISMA_CONFIG_PATH = path.resolve(hostPackageRoot, "prisma.config.ts");
    const resolvedConsumerApp = await this.loadBuiltConsumerApp(buildManifest.entryPath);
    const env = { ...process.env };
    if (prismaCliOverride) {
      env.CODEMATION_PRISMA_CLI_PATH = prismaCliOverride;
    }
    env.CODEMATION_HOST_PACKAGE_ROOT = hostPackageRoot;
    env.CODEMATION_PRISMA_CONFIG_PATH = path.resolve(hostPackageRoot, "prisma.config.ts");
    const application = new CodemationApplication();
    application.useSharedWorkflowWebsocketServer(this.resolveSharedWorkflowWebsocketServer());
    const discoveredPlugins = await this.loadDiscoveredPlugins(buildManifest);

    application.useConfig(resolvedConsumerApp.config);
    if (discoveredPlugins.length > 0) {
      application.usePlugins(this.mergePlugins(resolvedConsumerApp.config.plugins ?? [], discoveredPlugins));
    }
    await application.applyPlugins({
      consumerRoot,
      repoRoot,
      env,
      workflowSources: resolvedConsumerApp.workflowSources,
    });
    await application.prepareFrontendServerContainer({
      repoRoot,
      env,
    });
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

    const container = application.getContainer();
    const workflowRegistry = container.resolve(CoreTokens.WorkflowRegistry);
    const engine = container.resolve(Engine);
    await engine.start([...workflowRegistry.list()]);

    return {
      application,
      authConfig: resolvedConsumerApp.config.auth,
      buildVersion: buildManifest.buildVersion,
      consumerRoot,
      repoRoot,
      workflowSources: resolvedConsumerApp.workflowSources,
    };
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

  private async invalidateContext(): Promise<void> {
    const activeRuntime = this.activeRuntime;
    this.activeRuntime = null;
    this.refreshPromise = null;
    this.resetNextApiApp();
    if (activeRuntime) {
      const activeContext = await activeRuntime.contextPromise.catch(() => null);
      if (activeContext) {
        await activeContext.application.stopFrontendServerContainer();
      }
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
      throw new Error(`Built consumer output not found at ${buildManifest.entryPath}. Run \`codemation build\` before starting the Next host.`);
    }
    if (!(await this.exists(buildManifest.pluginEntryPath))) {
      throw new Error(`Discovered plugins output not found at ${buildManifest.pluginEntryPath}. Run \`codemation build\` before starting the Next host.`);
    }
    return buildManifest;
  }

  private async resolveBuildManifestPath(): Promise<string> {
    const configuredPath = process.env.CODEMATION_CONSUMER_OUTPUT_MANIFEST_PATH;
    if (!configuredPath || configuredPath.trim().length === 0) {
      throw new Error("Missing CODEMATION_CONSUMER_OUTPUT_MANIFEST_PATH. Start the Next host through `codemation dev` or `codemation build`.");
    }
    const resolvedPath = path.resolve(configuredPath);
    if (!(await this.exists(resolvedPath))) {
      throw new Error(`Build manifest not found at ${resolvedPath}. Run \`codemation build\` before starting the Next host.`);
    }
    return resolvedPath;
  }

  private async loadBuiltConsumerApp(outputPath: string): Promise<CodemationConsumerApp> {
    const importedModule = (await import(
      /* webpackIgnore: true */ await this.createRuntimeImportSpecifier(outputPath)
    )) as {
      codemationConsumerApp?: CodemationConsumerApp;
      default?: CodemationConsumerApp;
    };
    const consumerApp = importedModule.codemationConsumerApp ?? importedModule.default;
    if (!consumerApp) {
      throw new Error(`Built consumer output did not export a Codemation consumer app: ${outputPath}`);
    }
    return consumerApp;
  }

  private async loadDiscoveredPlugins(buildManifest: CodemationConsumerBuildManifest): Promise<ReadonlyArray<CodemationPlugin>> {
    const resolvedPath = path.resolve(buildManifest.pluginEntryPath);
    if (!(await this.exists(resolvedPath))) {
      return [];
    }
    const importedModule = (await import(
      /* webpackIgnore: true */ await this.createRuntimeImportSpecifier(resolvedPath)
    )) as {
      codemationDiscoveredPlugins?: ReadonlyArray<CodemationPlugin>;
      default?: ReadonlyArray<CodemationPlugin>;
    };
    return importedModule.codemationDiscoveredPlugins ?? importedModule.default ?? [];
  }

  private mergePlugins(
    configuredPlugins: ReadonlyArray<CodemationPlugin>,
    discoveredPlugins: ReadonlyArray<CodemationPlugin>,
  ): ReadonlyArray<CodemationPlugin> {
    const pluginsByConstructor = new Map<unknown, CodemationPlugin>();
    [...configuredPlugins, ...discoveredPlugins].forEach((plugin: CodemationPlugin) => {
      const constructorKey = Object.getPrototypeOf(plugin)?.constructor ?? plugin;
      if (!pluginsByConstructor.has(constructorKey)) {
        pluginsByConstructor.set(constructorKey, plugin);
      }
    });
    return [...pluginsByConstructor.values()];
  }

  private async createRuntimeImportSpecifier(filePath: string): Promise<string> {
    const fileUrl = pathToFileURL(filePath);
    const fileStats = await stat(filePath);
    fileUrl.searchParams.set("t", String(fileStats.mtimeMs));
    return fileUrl.href;
  }

  private resolveSharedWorkflowWebsocketServer(): WorkflowWebsocketServer {
    if (!this.sharedWorkflowWebsocketServer) {
      this.sharedWorkflowWebsocketServer = new WorkflowWebsocketServer(
        this.resolveWebSocketPort(),
        this.resolveWebSocketBindHost(),
        new ServerLoggerFactory(logLevelPolicyFactory).create("codemation-websocket.server"),
      );
    }
    return this.sharedWorkflowWebsocketServer;
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

  private async swapRuntime(buildManifest: CodemationConsumerBuildManifest): Promise<CodemationNextHostContext> {
    this.resetNextApiApp();
    const previousRuntime = this.activeRuntime;
    const previousContext = previousRuntime ? await previousRuntime.contextPromise.catch(() => null) : null;
    const nextContext = await this.createContext(buildManifest);
    this.activeRuntime = {
      buildVersion: nextContext.buildVersion,
      contextPromise: Promise.resolve(nextContext),
    };
    if (previousContext) {
      await this.emitWorkflowChangedEvents({
        previousContext,
        nextContext,
      });
      await previousContext.application.stopFrontendServerContainer({
        stopWebsocketServer: false,
      });
    }
    return nextContext;
  }

  private async emitWorkflowChangedEvents(args: Readonly<{
    previousContext: CodemationNextHostContext;
    nextContext: CodemationNextHostContext;
  }>): Promise<void> {
    const changedWorkflowIds = this.resolveChangedWorkflowIds(args);
    if (changedWorkflowIds.length === 0) {
      return;
    }
    const workflowWebsocketServer = this.resolveSharedWorkflowWebsocketServer();
    for (const workflowId of changedWorkflowIds) {
      await workflowWebsocketServer.publishToRoom(workflowId, {
        kind: "workflowChanged",
        workflowId,
      });
    }
  }

  private async resolveActiveContext(): Promise<CodemationNextHostContext | null> {
    const activeRuntime = this.activeRuntime;
    if (!activeRuntime) {
      return null;
    }
    return await activeRuntime.contextPromise.catch(() => null);
  }

  private async publishBuildLifecycleMessage(
    context: CodemationNextHostContext,
    createMessage: (workflowId: string) => Parameters<WorkflowWebsocketServer["publishToRoom"]>[1],
  ): Promise<void> {
    const workflowIds = this.resolveWorkflowIds(context);
    if (workflowIds.length === 0) {
      return;
    }
    const workflowWebsocketServer = this.resolveSharedWorkflowWebsocketServer();
    for (const workflowId of workflowIds) {
      await workflowWebsocketServer.publishToRoom(workflowId, createMessage(workflowId));
    }
  }

  private resolveChangedWorkflowIds(args: Readonly<{
    previousContext: CodemationNextHostContext;
    nextContext: CodemationNextHostContext;
  }>): ReadonlyArray<string> {
    const previousWorkflowsById = this.mapWorkflowsById(args.previousContext);
    const nextWorkflowsById = this.mapWorkflowsById(args.nextContext);
    const workflowIds = new Set<string>([
      ...previousWorkflowsById.keys(),
      ...nextWorkflowsById.keys(),
    ]);
    return [...workflowIds].filter((workflowId) => previousWorkflowsById.get(workflowId) !== nextWorkflowsById.get(workflowId));
  }

  private mapWorkflowsById(context: CodemationNextHostContext): ReadonlyMap<string, string> {
    const mapper = context.application.getContainer().resolve(WorkflowDefinitionMapper);
    const entries = context.application.getWorkflows().map((workflow) => {
      return [workflow.id, JSON.stringify(mapper.mapSync(workflow))] as const;
    });
    return new Map(entries);
  }

  private resolveWorkflowIds(context: CodemationNextHostContext): ReadonlyArray<string> {
    return context.application.getWorkflows().map((workflow) => workflow.id);
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
