import type { Container } from "@codemation/core";
import type { AppConfig, AppPluginLoadSummary, CodemationPlugin } from "@codemation/host";
import { CodemationPluginPackageMetadata } from "@codemation/host";
import {
  ApplicationTokens,
  AppContainerFactory,
  AppContainerLifecycle,
  CodemationHonoApiApp,
  CodemationPluginListMerger,
  FrontendRuntime,
  logLevelPolicyFactory,
  ServerLoggerFactory,
  WorkflowWebsocketServer,
} from "@codemation/host/next/server";
import {
  AppConfigLoader,
  CodemationPluginDiscovery,
  type CodemationResolvedPluginPackage,
} from "@codemation/host/server";
import { CodemationTsyringeTypeInfoRegistrar } from "@codemation/host/dev-server-sidecar";
import type { PrismaClient } from "@codemation/host-src/infrastructure/persistence/generated/prisma-client/client.js";
import type { Hono } from "hono";
import { access } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

import { NextHostPackageRootResolver } from "./NextHostPackageRootResolver";

export type CodemationNextHostContext = Readonly<{
  container: Container;
  consumerRoot: string;
  repoRoot: string;
  workflowSources: ReadonlyArray<string>;
}>;

type CodemationNextHostGlobal = typeof globalThis & {
  __codemationNextHost__?: CodemationNextHost;
};

export class CodemationNextHost {
  private readonly require = createRequire(import.meta.url);
  private readonly appConfigLoader = new AppConfigLoader();
  private readonly pluginDiscovery = new CodemationPluginDiscovery();
  private readonly pluginPackageMetadata = new CodemationPluginPackageMetadata();
  private readonly pluginListMerger = new CodemationPluginListMerger(this.pluginPackageMetadata);
  private readonly hostPackageRootResolver = new NextHostPackageRootResolver(
    {
      exists: async (filePath: string) => await this.exists(filePath),
    },
    {
      resolveHostPackageJsonPath: () => this.require.resolve("@codemation/host/package.json"),
    },
  );
  private contextPromise: Promise<CodemationNextHostContext> | null = null;
  private nextApiApp: Hono | null = null;
  private prepareInFlight: Promise<CodemationNextHostContext> | null = null;
  private sharedWorkflowWebsocketServer: WorkflowWebsocketServer | null = null;

  static get shared(): CodemationNextHost {
    const globalState = globalThis as CodemationNextHostGlobal;
    if (!globalState.__codemationNextHost__) {
      globalState.__codemationNextHost__ = new CodemationNextHost();
    }
    return globalState.__codemationNextHost__;
  }

  async prepare(): Promise<CodemationNextHostContext> {
    if (this.prepareInFlight) {
      return this.prepareInFlight;
    }
    this.prepareInFlight = this.prepareInternal();
    try {
      return await this.prepareInFlight;
    } finally {
      this.prepareInFlight = null;
    }
  }

  async getContainer(): Promise<Container> {
    return (await this.prepare()).container;
  }

  async getPreparedPrismaClient(): Promise<PrismaClient> {
    const preparedContext = await this.prepare();
    const existingPrisma = this.tryResolvePreparedPrismaClient(preparedContext);
    if (existingPrisma) {
      return existingPrisma;
    }
    await this.teardownLoadedContext();
    const refreshedContext = await this.prepare();
    const refreshedPrisma = this.tryResolvePreparedPrismaClient(refreshedContext);
    if (refreshedPrisma) {
      return refreshedPrisma;
    }
    throw new Error(
      [
        "Codemation authentication requires prepared runtime database persistence.",
        "Ensure the Next host has been prepared with PostgreSQL or PGlite before creating the auth adapter.",
      ].join(" "),
    );
  }

  async fetchApi(request: Request): Promise<Response> {
    const context = await this.prepare();
    const app = this.resolveNextApiApp(context);
    return app.fetch(request);
  }

  private async prepareInternal(): Promise<CodemationNextHostContext> {
    if (!this.contextPromise) {
      this.contextPromise = this.createContext();
    }
    return await this.contextPromise;
  }

  private async createContext(): Promise<CodemationNextHostContext> {
    const consumerRoot = this.resolveConsumerRoot();
    const repoRoot = await this.detectWorkspaceRoot(consumerRoot);
    const prismaCliOverride = await this.resolvePrismaCliOverride();
    const hostPackageRoot = await this.hostPackageRootResolver.resolve(repoRoot, process.env);
    const env = { ...process.env };
    if (prismaCliOverride) {
      env.CODEMATION_PRISMA_CLI_PATH = prismaCliOverride;
      process.env.CODEMATION_PRISMA_CLI_PATH = prismaCliOverride;
    }
    env.CODEMATION_HOST_PACKAGE_ROOT = hostPackageRoot;
    env.CODEMATION_PRISMA_CONFIG_PATH = path.resolve(hostPackageRoot, "prisma.config.ts");
    env.CODEMATION_CONSUMER_ROOT = consumerRoot;
    process.env.CODEMATION_HOST_PACKAGE_ROOT = env.CODEMATION_HOST_PACKAGE_ROOT;
    process.env.CODEMATION_PRISMA_CONFIG_PATH = env.CODEMATION_PRISMA_CONFIG_PATH;
    process.env.CODEMATION_CONSUMER_ROOT = consumerRoot;
    const configResolution = await this.appConfigLoader.load({
      consumerRoot,
      repoRoot,
      env,
      configPathOverride: process.env.CODEMATION_CONFIG_PATH,
    });
    const discoveredPlugins = await this.loadDiscoveredPlugins(consumerRoot);
    const mergedPlugins =
      discoveredPlugins.length > 0
        ? this.pluginListMerger.merge(configResolution.appConfig.plugins, discoveredPlugins)
        : configResolution.appConfig.plugins;
    const appConfig = {
      ...configResolution.appConfig,
      env,
      plugins: mergedPlugins,
      pluginLoadSummary: this.createPluginLoadSummary(
        configResolution.appConfig.plugins,
        discoveredPlugins,
        mergedPlugins,
      ),
    };
    const container = await new AppContainerFactory().create({
      appConfig,
      sharedWorkflowWebsocketServer: this.resolveSharedWorkflowWebsocketServer(),
    });
    const typeInfoRegistrar = new CodemationTsyringeTypeInfoRegistrar(container);
    typeInfoRegistrar.registerWorkflowDefinitions(appConfig.workflows ?? []);
    await container
      .resolve(FrontendRuntime)
      .start({ skipPresentationServers: Boolean(process.env.CODEMATION_RUNTIME_DEV_URL?.trim()) });
    return {
      container,
      consumerRoot,
      repoRoot,
      workflowSources: appConfig.workflowSources,
    };
  }

  private async teardownLoadedContext(): Promise<void> {
    if (!this.contextPromise) {
      return;
    }
    try {
      const context = await this.contextPromise;
      await context.container.resolve(AppContainerLifecycle).stop({ stopWebsocketServer: false });
    } catch {
      // Best-effort teardown before retrying runtime preparation.
    }
    this.contextPromise = null;
    this.nextApiApp = null;
  }

  private resolveNextApiApp(context: CodemationNextHostContext): Hono {
    if (this.nextApiApp) {
      return this.nextApiApp;
    }
    this.nextApiApp = context.container.resolve(CodemationHonoApiApp).getHono();
    return this.nextApiApp;
  }

  private async loadDiscoveredPlugins(consumerRoot: string): Promise<ReadonlyArray<CodemationPlugin>> {
    const resolvedPackages = await this.pluginDiscovery.resolvePlugins(consumerRoot);
    return resolvedPackages.map((resolvedPackage: CodemationResolvedPluginPackage) => resolvedPackage.plugin);
  }

  private createPluginLoadSummary(
    configuredPlugins: ReadonlyArray<CodemationPlugin>,
    discoveredPlugins: ReadonlyArray<CodemationPlugin>,
    mergedPlugins: ReadonlyArray<CodemationPlugin>,
  ): AppConfig["pluginLoadSummary"] {
    const configuredPluginSet = new Set(configuredPlugins);
    const discoveredPluginSet = new Set(discoveredPlugins);
    const summaries: AppPluginLoadSummary[] = [];
    for (const plugin of mergedPlugins) {
      const packageName = this.pluginPackageMetadata.readPackageName(plugin);
      if (!packageName) {
        continue;
      }
      summaries.push({
        packageName,
        source: configuredPluginSet.has(plugin) || !discoveredPluginSet.has(plugin) ? "configured" : "discovered",
      });
    }
    return summaries;
  }

  private resolveConsumerRoot(): string {
    const configuredPath = process.env.CODEMATION_CONSUMER_ROOT?.trim();
    if (!configuredPath || configuredPath.length === 0) {
      throw new Error("Missing CODEMATION_CONSUMER_ROOT. Start the Next host through a Codemation CLI entrypoint.");
    }
    return path.resolve(configuredPath);
  }

  private tryResolvePreparedPrismaClient(context: CodemationNextHostContext): PrismaClient | null {
    const container = context.container;
    if (!container.isRegistered(ApplicationTokens.PrismaClient, true)) {
      return null;
    }
    return container.resolve(ApplicationTokens.PrismaClient);
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

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
