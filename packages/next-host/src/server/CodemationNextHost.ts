import type { Container } from "@codemation/core";
import type { CodemationAuthConfig, CodemationPlugin } from "@codemation/host";
import {
  ApplicationTokens,
  CodemationApplication,
  CodemationBootstrapRequest,
  CodemationFrontendBootstrapRequest,
  CodemationHonoApiApp,
  CodemationPluginListMerger,
  logLevelPolicyFactory,
  ServerLoggerFactory,
  WorkflowWebsocketServer,
} from "@codemation/host/next/server";
import type { PrismaClient } from "@codemation/host-src/infrastructure/persistence/generated/prisma-client/client.js";
import { CodemationTsyringeTypeInfoRegistrar } from "@codemation/host/dev-server-sidecar";
import type { CodemationConsumerApp } from "@codemation/host-src/presentation/server/CodemationConsumerAppResolver";
import type { Hono } from "hono";
import { access, readFile, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { CodemationWhitelabelSnapshotFactory } from "../whitelabel/CodemationWhitelabelSnapshotFactory";
import type { CodemationWhitelabelSnapshot } from "../whitelabel/CodemationWhitelabelSnapshot";
import { NextHostPackageRootResolver } from "./NextHostPackageRootResolver";

export type CodemationNextHostContext = Readonly<{
  application: CodemationApplication;
  authConfig: CodemationAuthConfig | undefined;
  buildVersion: string;
  consumerRoot: string;
  repoRoot: string;
  workflowSources: ReadonlyArray<string>;
  /** Derived from the loaded consumer manifest config (same source as {@link CodemationApplication.useConfig}). */
  whitelabelSnapshot: CodemationWhitelabelSnapshot;
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

/**
 * Next-hosted consumer runtime: one loaded context per process.
 * In development, the consumer manifest `buildVersion` is re-read on each prepare; when it changes
 * (e.g. after `codemation build` / dev publish), the previous {@link CodemationApplication} is torn
 * down so whitelabel and config updates apply without restarting Next.
 */
export class CodemationNextHost {
  private readonly require = createRequire(import.meta.url);
  private readonly pluginListMerger = new CodemationPluginListMerger();
  private readonly hostPackageRootResolver = new NextHostPackageRootResolver(
    {
      exists: async (filePath: string) => await this.exists(filePath),
    },
    {
      resolveHostPackageJsonPath: () => this.require.resolve("@codemation/host/package.json"),
    },
  );
  private nextApiApp: Hono | null = null;
  private nextApiAppBuildVersion: string | null = null;
  private contextPromise: Promise<CodemationNextHostContext> | null = null;
  /** Tracks which manifest `buildVersion` the current {@link contextPromise} was built from (dev invalidation). */
  private loadedManifestBuildVersion: string | null = null;
  /** Single-flight so concurrent `prepare()` calls do not create duplicate application graphs. */
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

  private async prepareInternal(): Promise<CodemationNextHostContext> {
    const manifest = await this.resolveBuildManifest();
    if (this.shouldReloadContextForDev(manifest)) {
      await this.teardownLoadedContext();
    }
    if (!this.contextPromise) {
      const context = await this.createContext(manifest);
      this.loadedManifestBuildVersion = manifest.buildVersion;
      this.contextPromise = Promise.resolve(context);
    }
    return await this.contextPromise;
  }

  private shouldReloadContextForDev(manifest: CodemationConsumerBuildManifest): boolean {
    if (process.env.NODE_ENV === "production") {
      return false;
    }
    if (this.contextPromise === null || this.loadedManifestBuildVersion === null) {
      return false;
    }
    return this.loadedManifestBuildVersion !== manifest.buildVersion;
  }

  private async teardownLoadedContext(): Promise<void> {
    if (!this.contextPromise) {
      return;
    }
    try {
      const ctx = await this.contextPromise;
      await ctx.application.stop({ stopWebsocketServer: false });
    } catch {
      // Best-effort teardown before reloading consumer output.
    }
    this.contextPromise = null;
    this.nextApiApp = null;
    this.nextApiAppBuildVersion = null;
    this.loadedManifestBuildVersion = null;
  }

  async getContainer(): Promise<Container> {
    return (await this.prepare()).application.getContainer();
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

  /**
   * Resolved whitelabel for Server Components (sidebar, login, metadata). Requires {@link prepare} first.
   * Uses the snapshot captured from the built consumer config so branding matches `codemation.config` even if DI
   * resolution were ever misaligned in a bundled server graph.
   */
  async getWhitelabelSnapshot(): Promise<CodemationWhitelabelSnapshot> {
    const context = await this.prepare();
    return context.whitelabelSnapshot;
  }

  /**
   * Entry point for all `/api/**` traffic when the App Router route is not proxying to the dev gateway.
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
    this.nextApiApp = coreApp;
    this.nextApiAppBuildVersion = context.buildVersion;
    return coreApp;
  }

  private async createContext(buildManifest: CodemationConsumerBuildManifest): Promise<CodemationNextHostContext> {
    const consumerRoot = path.resolve(buildManifest.consumerRoot);
    const repoRoot = await this.detectWorkspaceRoot(consumerRoot);
    const prismaCliOverride = await this.resolvePrismaCliOverride();
    const hostPackageRoot = await this.hostPackageRootResolver.resolve(repoRoot, process.env);
    if (prismaCliOverride) {
      process.env.CODEMATION_PRISMA_CLI_PATH = prismaCliOverride;
    }
    process.env.CODEMATION_HOST_PACKAGE_ROOT = hostPackageRoot;
    process.env.CODEMATION_PRISMA_CONFIG_PATH = path.resolve(hostPackageRoot, "prisma.config.ts");
    const resolvedConsumerApp = await this.loadBuiltConsumerApp(buildManifest.entryPath);
    const whitelabelSnapshot = CodemationWhitelabelSnapshotFactory.fromConsumerConfig(resolvedConsumerApp.config);
    const env = { ...process.env };
    if (prismaCliOverride) {
      env.CODEMATION_PRISMA_CLI_PATH = prismaCliOverride;
    }
    env.CODEMATION_HOST_PACKAGE_ROOT = hostPackageRoot;
    env.CODEMATION_PRISMA_CONFIG_PATH = path.resolve(hostPackageRoot, "prisma.config.ts");
    env.CODEMATION_CONSUMER_ROOT = consumerRoot;
    const isRuntimeDevProxy = Boolean(process.env.CODEMATION_RUNTIME_DEV_URL?.trim());
    const bootstrapRequest = new CodemationBootstrapRequest({
      consumerRoot,
      repoRoot,
      env,
      workflowSources: resolvedConsumerApp.workflowSources,
    });
    const application = new CodemationApplication();
    application.useSharedWorkflowWebsocketServer(this.resolveSharedWorkflowWebsocketServer());
    const discoveredPlugins = await this.loadDiscoveredPlugins(buildManifest);

    application.useConfig(resolvedConsumerApp.config);
    if (discoveredPlugins.length > 0) {
      application.usePlugins(this.pluginListMerger.merge(resolvedConsumerApp.config.plugins ?? [], discoveredPlugins));
    }
    await application.applyPlugins(bootstrapRequest);
    await application.prepareContainer(bootstrapRequest);
    const typeInfoRegistrar = new CodemationTsyringeTypeInfoRegistrar(application.getContainer());
    typeInfoRegistrar.registerWorkflowDefinitions(resolvedConsumerApp.config.workflows ?? []);
    await application.bootFrontend(
      new CodemationFrontendBootstrapRequest({
        bootstrap: bootstrapRequest,
        skipPresentationServers: isRuntimeDevProxy,
      }),
    );
    return {
      application,
      authConfig: resolvedConsumerApp.config.auth,
      buildVersion: buildManifest.buildVersion,
      consumerRoot,
      repoRoot,
      workflowSources: resolvedConsumerApp.workflowSources,
      whitelabelSnapshot,
    };
  }

  private tryResolvePreparedPrismaClient(context: CodemationNextHostContext): PrismaClient | null {
    const container = context.application.getContainer();
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

  private async resolveBuildManifest(): Promise<CodemationConsumerBuildManifest> {
    const manifestPath = await this.resolveBuildManifestPath();
    const manifestText = await readFile(manifestPath, "utf8");
    const parsedManifest = JSON.parse(manifestText) as Partial<CodemationConsumerBuildManifest>;
    if (
      typeof parsedManifest.buildVersion !== "string" ||
      typeof parsedManifest.consumerRoot !== "string" ||
      typeof parsedManifest.entryPath !== "string" ||
      typeof parsedManifest.pluginEntryPath !== "string" ||
      !Array.isArray(parsedManifest.workflowSourcePaths)
    ) {
      throw new Error(`Invalid Codemation consumer build manifest at ${manifestPath}.`);
    }
    const buildManifest: CodemationConsumerBuildManifest = {
      buildVersion: parsedManifest.buildVersion,
      consumerRoot: path.resolve(parsedManifest.consumerRoot),
      entryPath: path.resolve(parsedManifest.entryPath),
      pluginEntryPath: path.resolve(parsedManifest.pluginEntryPath),
      workflowSourcePaths: parsedManifest.workflowSourcePaths.filter(
        (workflowSourcePath): workflowSourcePath is string => typeof workflowSourcePath === "string",
      ),
    };
    if (!(await this.exists(buildManifest.entryPath))) {
      throw new Error(
        `Built consumer output not found at ${buildManifest.entryPath}. Run \`codemation build\` before starting the Next host.`,
      );
    }
    if (!(await this.exists(buildManifest.pluginEntryPath))) {
      throw new Error(
        `Discovered plugins output not found at ${buildManifest.pluginEntryPath}. Run \`codemation build\` before starting the Next host.`,
      );
    }
    return buildManifest;
  }

  private async resolveBuildManifestPath(): Promise<string> {
    const configuredPath = process.env.CODEMATION_CONSUMER_OUTPUT_MANIFEST_PATH;
    if (!configuredPath || configuredPath.trim().length === 0) {
      throw new Error(
        "Missing CODEMATION_CONSUMER_OUTPUT_MANIFEST_PATH. Start the Next host through `codemation dev` or `codemation build`.",
      );
    }
    const resolvedPath = path.resolve(configuredPath);
    if (!(await this.exists(resolvedPath))) {
      throw new Error(
        `Build manifest not found at ${resolvedPath}. Run \`codemation build\` before starting the Next host.`,
      );
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

  private async loadDiscoveredPlugins(
    buildManifest: CodemationConsumerBuildManifest,
  ): Promise<ReadonlyArray<CodemationPlugin>> {
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

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}
