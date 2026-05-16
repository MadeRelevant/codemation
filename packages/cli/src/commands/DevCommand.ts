import type { CodemationPluginDiscovery } from "@codemation/host/server";
import type { Logger } from "@codemation/host/next/server";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import type { ConsumerBuildArtifactsPublisher } from "../build/ConsumerBuildArtifactsPublisher";
import type { ConsumerOutputBuilderFactory } from "../consumer/ConsumerOutputBuilderFactory";
import type { DatabaseMigrationsApplyService } from "../database/DatabaseMigrationsApplyService";
import type { DevApiRuntimeFactory, DevApiRuntimeServerHandle } from "../dev/DevApiRuntimeFactory";
import type { DevBootstrapSummaryFetcher } from "../dev/DevBootstrapSummaryFetcher";
import { ConsumerSourceErrorParser } from "../dev/ConsumerSourceErrorParser";
import type { CliDevProxyServer } from "../dev/CliDevProxyServer";
import type { CliDevProxyServerFactory } from "../dev/CliDevProxyServerFactory";
import type { DevCliBannerRenderer } from "../dev/DevCliBannerRenderer";
import type { DevNextChildProcessOutputFilter } from "../dev/DevNextChildProcessOutputFilter";
import { ConsumerEnvDotenvFilePredicate } from "../dev/ConsumerEnvDotenvFilePredicate";
import type { DevRebuildQueueFactory } from "../dev/DevRebuildQueueFactory";
import type { DevSourceWatcher } from "../dev/DevSourceWatcher";
import { DevSessionServices } from "../dev/DevSessionServices";
import { DevLockFactory } from "../dev/Factory";
import { DevTrackedProcessTreeKiller } from "../dev/DevTrackedProcessTreeKiller";
import { DevSourceWatcherFactory } from "../dev/Runner";
import type { NextHostEdgeSeed } from "../dev/NextHostEdgeSeedLoader";
import type { WorkspacePluginPackageResolver } from "../dev/WorkspacePluginPackageResolver";
import { WorkspacePluginDevProcessCoordinator } from "../dev/WorkspacePluginDevProcessCoordinator";
import { CliPathResolver, type CliPaths } from "../path/CliPathResolver";
import { NextHostConsumerServerCommandFactory } from "../runtime/NextHostConsumerServerCommandFactory";
import { TypeScriptRuntimeConfigurator } from "../runtime/TypeScriptRuntimeConfigurator";

import type { DevMode, DevMutableProcessState, DevPreparedRuntime } from "./devCommandLifecycle.types";
import type { ConsumerAgentSkillsSyncService } from "../skills/ConsumerAgentSkillsSyncService";
import type { DevModeResolver } from "../dev/DevModeResolver";

export class DevCommand {
  private readonly require = createRequire(import.meta.url);

  constructor(
    private readonly pathResolver: CliPathResolver,
    private readonly consumerAgentSkillsSyncService: ConsumerAgentSkillsSyncService,
    private readonly tsRuntime: TypeScriptRuntimeConfigurator,
    private readonly devLockFactory: DevLockFactory,
    private readonly devSourceWatcherFactory: DevSourceWatcherFactory,
    private readonly cliLogger: Logger,
    private readonly session: DevSessionServices,
    private readonly databaseMigrationsApplyService: DatabaseMigrationsApplyService,
    private readonly consumerOutputBuilderFactory: ConsumerOutputBuilderFactory,
    private readonly pluginDiscovery: CodemationPluginDiscovery,
    private readonly consumerBuildArtifactsPublisher: ConsumerBuildArtifactsPublisher,
    private readonly devBootstrapSummaryFetcher: DevBootstrapSummaryFetcher,
    private readonly devModeResolver: DevModeResolver,
    private readonly devCliBannerRenderer: DevCliBannerRenderer,
    private readonly consumerEnvDotenvFilePredicate: ConsumerEnvDotenvFilePredicate,
    private readonly devTrackedProcessTreeKiller: DevTrackedProcessTreeKiller,
    private readonly workspacePluginPackageResolver: WorkspacePluginPackageResolver,
    private readonly workspacePluginDevProcessCoordinator: WorkspacePluginDevProcessCoordinator,
    private readonly nextHostConsumerServerCommandFactory: NextHostConsumerServerCommandFactory,
    private readonly devApiRuntimeFactory: DevApiRuntimeFactory,
    private readonly cliDevProxyServerFactory: CliDevProxyServerFactory,
    private readonly devRebuildQueueFactory: DevRebuildQueueFactory,
    private readonly devNextChildProcessOutputFilter: DevNextChildProcessOutputFilter,
    private readonly consumerSourceErrorParser: ConsumerSourceErrorParser,
  ) {}

  async execute(
    args: Readonly<{
      consumerRoot: string;
      watchFramework?: boolean;
      apiOnly?: boolean;
      commandName?: "dev" | "dev:plugin";
      configPathOverride?: string;
    }>,
  ): Promise<void> {
    const paths = await this.pathResolver.resolve(args.consumerRoot);
    await this.consumerAgentSkillsSyncService.sync(paths.consumerRoot, {
      mode: "automatic",
      repoRoot: paths.repoRoot,
    });
    const commandName = args.commandName ?? "dev";
    const previousDevelopmentServerToken = process.env.CODEMATION_DEV_SERVER_TOKEN;
    this.devCliBannerRenderer.renderBrandHeader();
    this.tsRuntime.configure(paths.repoRoot);
    await this.databaseMigrationsApplyService.applyForConsumer(paths.consumerRoot, {
      configPath: args.configPathOverride,
    });
    const devMode = this.resolveDevMode(args);
    const { nextPort, gatewayPort } = await this.session.sessionPorts.resolve({
      devMode,
      portEnv: process.env.PORT,
      gatewayPortEnv: process.env.CODEMATION_DEV_GATEWAY_HTTP_PORT,
    });
    const devLock = this.devLockFactory.create();
    await devLock.acquire({
      consumerRoot: paths.consumerRoot,
      nextPort: gatewayPort,
    });
    const authSettings = await this.session.nextHostEdgeSeedLoader.loadForConsumer(paths.consumerRoot, {
      configPathOverride: args.configPathOverride,
    });
    const watcher = this.devSourceWatcherFactory.create();
    const processState = this.createInitialProcessState();
    let proxyServer: CliDevProxyServer | null = null;
    try {
      const prepared = await this.prepareDevRuntime(
        paths,
        devMode,
        nextPort,
        gatewayPort,
        authSettings,
        args.configPathOverride,
      );
      if (prepared.devMode === "watch-framework") {
        if (prepared.watchWorkspacePlugins) {
          processState.currentWorkspacePluginBuilds = await this.workspacePluginDevProcessCoordinator.start({
            env: process.env,
            packages: await this.workspacePluginPackageResolver.resolve({
              consumerRoot: prepared.paths.consumerRoot,
              repoRoot: prepared.paths.repoRoot,
            }),
            repoRoot: prepared.paths.repoRoot,
            onUnexpectedExit: (error: Error) => {
              void this.failDevSessionAfterIrrecoverableSourceError(processState, proxyServer, error);
            },
          });
        } else {
          process.stdout.write(
            "[codemation] Workspace-plugin live rebuild is OFF. The runtime will load each plugin's existing dist/ output. Set CODEMATION_DEV_WATCH_PLUGINS=true to spawn `tsdown --watch` for each workspace plugin (≈500 MB extra; tight on 8-GB boxes).\n",
          );
        }
      }
      if (prepared.devMode !== "watch-framework") {
        await this.publishConsumerArtifacts(prepared.paths, prepared.configPathOverride);
      }
      // The disposable runtime is created in-process, so config reloads must see the same token in
      // `process.env` that we also pass through the child-facing env object.
      process.env.CODEMATION_DEV_SERVER_TOKEN = prepared.developmentServerToken;
      const stopPromise = this.wireStopPromise(processState);
      const uiProxyBase = await this.preparePackagedUiBaseUrlWhenNeeded(prepared, processState);
      proxyServer = await this.startProxyServer(prepared.gatewayPort, uiProxyBase);
      const gatewayBaseUrl = this.gatewayBaseHttpUrl(gatewayPort);
      await this.bootInitialRuntime(prepared, processState, proxyServer);
      await this.session.devHttpProbe.waitUntilBootstrapSummaryReady(gatewayBaseUrl);
      const initialSummary = await this.devBootstrapSummaryFetcher.fetch(gatewayBaseUrl);
      if (initialSummary) {
        this.devCliBannerRenderer.renderRuntimeSummary(initialSummary);
      }
      await this.startPackagedUiWhenNeeded(prepared, processState, uiProxyBase);
      this.bindShutdownSignalsToChildProcesses(processState, proxyServer);
      await this.spawnDevUiWhenNeeded(prepared, processState, gatewayBaseUrl);
      this.devCliBannerRenderer.renderGatewayListeningHint(
        prepared.gatewayPort,
        commandName,
        prepared.devMode,
        prepared.devMode === "watch-framework" ? prepared.gatewayPort : undefined,
      );
      await this.startWatcherForSourceRestart(prepared, processState, watcher, devMode, gatewayBaseUrl, proxyServer, {
        commandName,
        configPathOverride: args.configPathOverride,
      });
      await stopPromise;
    } finally {
      if (previousDevelopmentServerToken === undefined) {
        delete process.env.CODEMATION_DEV_SERVER_TOKEN;
      } else {
        process.env.CODEMATION_DEV_SERVER_TOKEN = previousDevelopmentServerToken;
      }
      processState.stopRequested = true;
      await this.stopLiveProcesses(processState, proxyServer);
      await watcher.stop();
      await devLock.release();
    }
  }

  private resolveDevMode(args: Readonly<{ watchFramework?: boolean; apiOnly?: boolean }>): DevMode {
    return this.devModeResolver.resolve(args);
  }

  private async prepareDevRuntime(
    paths: CliPaths,
    devMode: DevMode,
    nextPort: number,
    gatewayPort: number,
    authSettings: NextHostEdgeSeed,
    configPathOverride?: string,
  ): Promise<DevPreparedRuntime> {
    const developmentServerToken = this.session.nextHostEdgeSeedLoader.resolveDevelopmentServerToken(
      process.env.CODEMATION_DEV_SERVER_TOKEN,
    );
    const consumerEnv = this.session.consumerEnvLoader.load(paths.consumerRoot);
    // Default OFF: workspace-plugin tsdown watchers and their dist/ watch roots cost ~500 MB
    // baseline (esbuild service + tsdown V8 heap + plugin module graph) and stack with
    // next-server's compile spike to OOM-kill the dev session on 8-GB WSL boxes. Opt in via
    // CODEMATION_DEV_WATCH_PLUGINS=true when actively editing a workspace plugin's source.
    const watchWorkspacePlugins = this.parseBooleanEnv(process.env.CODEMATION_DEV_WATCH_PLUGINS);
    return {
      paths,
      configPathOverride,
      devMode,
      nextPort,
      gatewayPort,
      authSettings,
      developmentServerToken,
      consumerEnv,
      watchWorkspacePlugins,
    };
  }

  private parseBooleanEnv(value: string | undefined): boolean {
    if (value === undefined) return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
  }

  private createInitialProcessState(): DevMutableProcessState {
    return {
      currentDevUi: null,
      currentPackagedUi: null,
      currentPackagedUiBaseUrl: null,
      currentRuntime: null,
      currentWorkspacePluginBuilds: [],
      isRestartingUi: false,
      stopRequested: false,
      stopResolve: null,
      stopReject: null,
    };
  }

  private wireStopPromise(state: DevMutableProcessState): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      state.stopResolve = resolve;
      state.stopReject = reject;
    });
  }

  private gatewayBaseHttpUrl(gatewayPort: number): string {
    return `http://127.0.0.1:${gatewayPort}`;
  }

  private parsePortFromBaseUrl(baseUrl: string): number {
    const port = Number.parseInt(new URL(baseUrl).port, 10);
    if (!Number.isFinite(port) || port <= 0) {
      throw new Error(`Cannot extract port from base URL: ${baseUrl}`);
    }
    return port;
  }

  private async preparePackagedUiBaseUrlWhenNeeded(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
  ): Promise<string> {
    if (prepared.devMode === "api-only") {
      // No UI process — proxy should not forward to any UI target.
      return "";
    }
    if (prepared.devMode !== "packaged-ui") {
      return `http://127.0.0.1:${prepared.nextPort}`;
    }
    const uiProxyBase =
      state.currentPackagedUiBaseUrl ?? `http://127.0.0.1:${await this.session.loopbackPortAllocator.allocate()}`;
    state.currentPackagedUiBaseUrl = uiProxyBase;
    return uiProxyBase;
  }

  private async startPackagedUiWhenNeeded(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    uiProxyBase: string,
  ): Promise<void> {
    if (prepared.devMode !== "packaged-ui" || uiProxyBase.length === 0) {
      return;
    }
    await this.spawnPackagedUi(prepared, state, prepared.authSettings, prepared.gatewayPort, uiProxyBase);
  }

  private async spawnPackagedUi(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    authSettings: NextHostEdgeSeed,
    websocketPort: number,
    uiProxyBase: string,
  ): Promise<void> {
    const nextHostPackageJsonPath = this.require.resolve("@codemation/next-host/package.json");
    const nextHostRoot = path.dirname(nextHostPackageJsonPath);
    const nextHostCommand = await this.nextHostConsumerServerCommandFactory.create({ nextHostRoot });
    const uiPort = Number(new URL(uiProxyBase).port);
    const nextHostEnvironment = this.session.nextHostEnvBuilder.buildConsumerUiProxy({
      authSecret: authSettings.authSecret,
      configPathOverride: prepared.configPathOverride,
      consumerRoot: prepared.paths.consumerRoot,
      developmentServerToken: prepared.developmentServerToken,
      nextPort: uiPort,
      publicBaseUrl: this.gatewayBaseHttpUrl(prepared.gatewayPort),
      runtimeDevUrl: this.gatewayBaseHttpUrl(prepared.gatewayPort),
      skipUiAuth: !authSettings.uiAuthEnabled,
      websocketPort,
    });
    state.currentPackagedUi = spawn(nextHostCommand.command, nextHostCommand.args, {
      cwd: nextHostCommand.cwd,
      ...this.devDetachedChildSpawnPipeOptions(),
      env: nextHostEnvironment,
    });
    this.devNextChildProcessOutputFilter.attach(state.currentPackagedUi);
    state.currentPackagedUi.on("error", (error) => {
      if (state.stopRequested || state.isRestartingUi) {
        return;
      }
      state.stopRequested = true;
      state.stopReject?.(error instanceof Error ? error : new Error(String(error)));
    });
    state.currentPackagedUi.on("exit", (code) => {
      if (state.stopRequested || state.isRestartingUi) {
        return;
      }
      state.stopRequested = true;
      state.stopReject?.(new Error(`next start (packaged UI) exited unexpectedly with code ${code ?? 0}.`));
    });
    await this.session.devHttpProbe.waitUntilTcpListenerReady("127.0.0.1", this.parsePortFromBaseUrl(uiProxyBase));
  }

  private async startProxyServer(gatewayPort: number, uiProxyBase: string): Promise<CliDevProxyServer> {
    const proxyServer = this.cliDevProxyServerFactory.create(gatewayPort);
    proxyServer.setUiProxyTarget(uiProxyBase.length > 0 ? uiProxyBase : null);
    await proxyServer.start();
    await this.session.devHttpProbe.waitUntilGatewayHealthy(this.gatewayBaseHttpUrl(gatewayPort));
    return proxyServer;
  }

  private async bootInitialRuntime(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    proxyServer: CliDevProxyServer,
  ): Promise<void> {
    try {
      const runtime = await this.createRuntime(prepared);
      state.currentRuntime = runtime;
      await proxyServer.activateRuntime({
        httpPort: runtime.httpPort,
        workflowWebSocketPort: runtime.workflowWebSocketPort,
      });
      proxyServer.setBuildStatus("idle");
    } catch (error) {
      const details = this.consumerSourceErrorParser.parse(error);
      proxyServer.broadcastBuildFailed(details);
      proxyServer.setBuildStatus("errored");
      // Leave the proxy running. Do NOT rethrow.
    }
  }

  /**
   * Next startup lines are filtered (see {@link DevNextChildProcessOutputFilter}) so the CLI can
   * own the primary “open this URL” message without the internal loopback port dominating stdout.
   */
  private devDetachedChildSpawnPipeOptions(): Readonly<{
    stdio: ["ignore", "pipe", "pipe"];
    detached: boolean;
    windowsHide?: boolean;
  }> {
    return process.platform === "win32"
      ? { stdio: ["ignore", "pipe", "pipe"], detached: true, windowsHide: true }
      : { stdio: ["ignore", "pipe", "pipe"], detached: true };
  }

  private bindShutdownSignalsToChildProcesses(
    state: DevMutableProcessState,
    proxyServer: CliDevProxyServer | null,
  ): void {
    let shutdownInProgress = false;
    const runShutdown = async (): Promise<void> => {
      if (shutdownInProgress) {
        return;
      }
      shutdownInProgress = true;
      state.stopRequested = true;
      process.stdout.write("\n[codemation] Stopping..\n");
      await this.stopLiveProcesses(state, proxyServer);
      process.stdout.write("[codemation] Stopped.\n");
      state.stopResolve?.();
    };
    for (const signal of ["SIGINT", "SIGTERM", "SIGQUIT"] as const) {
      process.on(signal, () => {
        void runShutdown();
      });
    }
  }

  private async spawnDevUiWhenNeeded(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    gatewayBaseUrl: string,
  ): Promise<void> {
    if (prepared.devMode !== "watch-framework") {
      return;
    }
    await this.spawnDevUi(prepared, state, gatewayBaseUrl, prepared.authSettings);
  }

  private async spawnDevUi(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    gatewayBaseUrl: string,
    authSettings: NextHostEdgeSeed,
  ): Promise<void> {
    const websocketPort = prepared.gatewayPort;
    const nextHostPackageJsonPath = this.require.resolve("@codemation/next-host/package.json");
    const nextHostRoot = path.dirname(nextHostPackageJsonPath);
    const nextHostEnvironment = this.session.nextHostEnvBuilder.build({
      authSecret: authSettings.authSecret,
      configPathOverride: prepared.configPathOverride,
      consumerRoot: prepared.paths.consumerRoot,
      developmentServerToken: prepared.developmentServerToken,
      nextPort: prepared.nextPort,
      skipUiAuth: !authSettings.uiAuthEnabled,
      websocketPort,
      runtimeDevUrl: gatewayBaseUrl,
    });

    await this.session.nextHostPortAvailability.assertLoopbackPortAvailable(prepared.nextPort);

    state.currentDevUi = spawn("pnpm", ["exec", "next", "dev"], {
      cwd: nextHostRoot,
      ...this.devDetachedChildSpawnPipeOptions(),
      env: nextHostEnvironment,
    });
    this.devNextChildProcessOutputFilter.attach(state.currentDevUi);
    state.currentDevUi.on("exit", (code) => {
      const normalizedCode = code ?? 0;
      if (state.stopRequested || state.isRestartingUi) {
        return;
      }
      if (normalizedCode === 0) {
        state.stopRequested = true;
        state.stopResolve?.();
        return;
      }
      state.stopRequested = true;
      state.stopReject?.(new Error(`next host exited with code ${normalizedCode}.`));
    });
    state.currentDevUi.on("error", (error) => {
      if (state.stopRequested || state.isRestartingUi) {
        return;
      }
      state.stopRequested = true;
      state.stopReject?.(error instanceof Error ? error : new Error(String(error)));
    });
    await this.session.devHttpProbe.waitUntilTcpListenerReady("127.0.0.1", prepared.nextPort);
  }

  private async startWatcherForSourceRestart(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    watcher: DevSourceWatcher,
    devMode: DevMode,
    gatewayBaseUrl: string,
    proxyServer: CliDevProxyServer,
    options: Readonly<{
      commandName: "dev" | "dev:plugin";
      configPathOverride?: string;
    }>,
  ): Promise<void> {
    const rebuildQueue = this.devRebuildQueueFactory.create({
      run: async (request) => {
        await this.runQueuedRebuild(prepared, state, gatewayBaseUrl, proxyServer, request);
      },
    });
    await watcher.start({
      roots: await this.session.watchRootsResolver.resolve({
        consumerRoot: prepared.paths.consumerRoot,
        devMode,
        repoRoot: prepared.paths.repoRoot,
        watchWorkspacePlugins: prepared.watchWorkspacePlugins,
      }),
      onChange: async ({ changedPaths }) => {
        if (changedPaths.length > 0 && changedPaths.every((p) => this.consumerEnvDotenvFilePredicate.matches(p))) {
          process.stdout.write(
            `\n[codemation] Consumer env file changed — reloading and restarting the runtime… [paths=${changedPaths.slice(0, 5).join(", ")}${changedPaths.length > 5 ? ` (+${changedPaths.length - 5} more)` : ""}]\n`,
          );
          // Re-read .env files from disk and replace the cached snapshot the
          // runtime spawn reads. `DevPreparedRuntime.consumerEnv` is typed
          // Readonly for documentation; DevCommand is the single owner of this
          // object across rebuilds, so mutating here is safe and avoids
          // threading a fresh `prepared` through the rebuild queue.
          (prepared as { consumerEnv: Readonly<Record<string, string>> }).consumerEnv =
            this.session.consumerEnvLoader.load(prepared.paths.consumerRoot);
          try {
            await rebuildQueue.enqueue({
              changedPaths,
              configPathOverride: options.configPathOverride,
              shouldRestartUi: true,
            });
          } catch (error) {
            await this.failDevSessionAfterIrrecoverableSourceError(state, proxyServer, error);
          }
          return;
        }
        try {
          const shouldRestartUi = this.session.sourceChangeClassifier.requiresUiRestart({
            changedPaths,
            consumerRoot: prepared.paths.consumerRoot,
          });
          process.stdout.write(
            shouldRestartUi
              ? `\n[codemation] Source change detected — rebuilding for \`${options.commandName}\`, restarting the runtime, and restarting the UI… [paths=${changedPaths.slice(0, 5).join(", ")}${changedPaths.length > 5 ? ` (+${changedPaths.length - 5} more)` : ""}]\n`
              : `\n[codemation] Source change detected — rebuilding for \`${options.commandName}\` and restarting the runtime… [paths=${changedPaths.slice(0, 5).join(", ")}${changedPaths.length > 5 ? ` (+${changedPaths.length - 5} more)` : ""}]\n`,
          );
          await rebuildQueue.enqueue({
            changedPaths,
            configPathOverride: options.configPathOverride,
            shouldRestartUi,
          });
        } catch (error) {
          await this.failDevSessionAfterIrrecoverableSourceError(state, proxyServer, error);
        }
      },
    });
  }

  private async runQueuedRebuild(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    gatewayBaseUrl: string,
    proxyServer: CliDevProxyServer,
    request: Readonly<{
      changedPaths: ReadonlyArray<string>;
      configPathOverride?: string;
      shouldRestartUi: boolean;
    }>,
  ): Promise<void> {
    void request.changedPaths;
    proxyServer.setBuildStatus("building");
    proxyServer.broadcastBuildStarted();
    // Stop the old runtime BEFORE creating the new one. The runtime is in-process — keeping both
    // alive doubles the framework + Prisma + plugin module footprint (~1–2 GB) and on a 4-CPU /
    // 8-GB WSL box this OOM-kills next-server (whose dev compile already sits around 2.7 GB).
    // Trade-off: the gateway returns 503 ("Runtime is rebuilding") for the swap window. Consumer
    // errors are still non-fatal — we land in `errored` build status and the session stays up.
    if (state.currentRuntime) {
      const previousRuntime = state.currentRuntime;
      state.currentRuntime = null;
      await proxyServer.activateRuntime(null);
      try {
        await previousRuntime.stop();
      } catch {
        // Ignore stop errors — we're discarding this runtime regardless.
      }
    }
    try {
      if (prepared.devMode !== "watch-framework") {
        await this.publishConsumerArtifacts(prepared.paths, request.configPathOverride);
      }
      process.stdout.write("[codemation] Waiting for runtime to accept traffic…\n");
      let runtime: DevApiRuntimeServerHandle;
      try {
        runtime = await this.createRuntime(prepared);
      } catch (error) {
        const details = this.consumerSourceErrorParser.parse(error);
        proxyServer.broadcastBuildFailed(details);
        proxyServer.setBuildStatus("errored");
        // Old runtime is already stopped; gateway will 503 until the next save fixes the build.
        return;
      }
      state.currentRuntime = runtime;
      await proxyServer.activateRuntime({
        httpPort: runtime.httpPort,
        workflowWebSocketPort: runtime.workflowWebSocketPort,
      });
      try {
        await this.session.devHttpProbe.waitUntilBootstrapSummaryReady(gatewayBaseUrl);
      } catch (error) {
        const details = this.consumerSourceErrorParser.parse(error);
        proxyServer.broadcastBuildFailed(details);
        proxyServer.setBuildStatus("errored");
        try {
          await runtime.stop();
        } catch {
          // Ignore cleanup errors
        }
        state.currentRuntime = null;
        await proxyServer.activateRuntime(null);
        return;
      }
      const json = await this.devBootstrapSummaryFetcher.fetch(gatewayBaseUrl);
      if (json) {
        this.devCliBannerRenderer.renderCompact(json);
      }
      proxyServer.setBuildStatus("idle");
      // Let the new runtime become queryable through the stable gateway before restarting the
      // packaged UI; otherwise the UI bootstrap hits `/api/bootstrap/*` while the gateway still
      // reports "Runtime is rebuilding" and the restart can deadlock indefinitely.
      if (request.shouldRestartUi && prepared.devMode !== "api-only") {
        await this.restartUiAfterSourceChange(prepared, state, gatewayBaseUrl);
      }
      proxyServer.broadcastBuildCompleted(runtime.buildVersion);
      process.stdout.write("[codemation] Runtime ready.\n");
    } catch (error) {
      proxyServer.setBuildStatus("idle");
      proxyServer.broadcastBuildFailed({
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async restartUiAfterSourceChange(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    gatewayBaseUrl: string,
  ): Promise<void> {
    const refreshedAuthSettings = await this.session.nextHostEdgeSeedLoader.loadForConsumer(
      prepared.paths.consumerRoot,
      {
        configPathOverride: prepared.configPathOverride,
      },
    );
    process.stdout.write("[codemation] Restarting the UI process to apply source changes…\n");
    state.isRestartingUi = true;
    try {
      if (prepared.devMode === "packaged-ui") {
        await this.restartPackagedUi(prepared, state, refreshedAuthSettings);
        return;
      }
      await this.restartDevUi(prepared, state, gatewayBaseUrl, refreshedAuthSettings);
    } finally {
      state.isRestartingUi = false;
    }
  }

  private async restartPackagedUi(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    authSettings: NextHostEdgeSeed,
  ): Promise<void> {
    if (
      state.currentPackagedUi &&
      state.currentPackagedUi.exitCode === null &&
      state.currentPackagedUi.signalCode === null
    ) {
      await this.devTrackedProcessTreeKiller.killProcessTreeRootedAt(state.currentPackagedUi);
    }
    state.currentPackagedUi = null;
    const uiProxyBaseUrl = state.currentPackagedUiBaseUrl;
    if (!uiProxyBaseUrl) {
      throw new Error("Packaged UI proxy base URL is missing during UI restart.");
    }
    await this.spawnPackagedUi(prepared, state, authSettings, prepared.gatewayPort, uiProxyBaseUrl);
  }

  private async restartDevUi(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    gatewayBaseUrl: string,
    authSettings: NextHostEdgeSeed,
  ): Promise<void> {
    if (state.currentDevUi && state.currentDevUi.exitCode === null && state.currentDevUi.signalCode === null) {
      await this.devTrackedProcessTreeKiller.killProcessTreeRootedAt(state.currentDevUi);
    }
    state.currentDevUi = null;
    await this.spawnDevUi(prepared, state, gatewayBaseUrl, authSettings);
  }

  private async failDevSessionAfterIrrecoverableSourceError(
    state: DevMutableProcessState,
    proxyServer: CliDevProxyServer | null,
    error: unknown,
  ): Promise<void> {
    const exception = error instanceof Error ? error : new Error(String(error));
    state.stopRequested = true;
    await this.stopLiveProcesses(state, proxyServer);
    state.stopReject?.(exception);
  }

  private async stopLiveProcesses(state: DevMutableProcessState, proxyServer: CliDevProxyServer | null): Promise<void> {
    await this.stopCurrentRuntime(state, proxyServer);
    const children: ChildProcess[] = [];
    for (const child of [state.currentPackagedUi, state.currentDevUi, ...state.currentWorkspacePluginBuilds]) {
      if (child && child.exitCode === null && child.signalCode === null) {
        children.push(child);
      }
    }
    state.currentWorkspacePluginBuilds = [];
    await Promise.all(children.map((child) => this.devTrackedProcessTreeKiller.killProcessTreeRootedAt(child)));
    if (proxyServer) {
      await proxyServer.stop();
    }
  }

  private async stopCurrentRuntime(
    state: DevMutableProcessState,
    proxyServer: CliDevProxyServer | null,
  ): Promise<void> {
    const runtime = state.currentRuntime;
    state.currentRuntime = null;
    if (proxyServer) {
      await proxyServer.activateRuntime(null);
    }
    if (runtime) {
      await runtime.stop();
    }
  }

  private async createRuntime(prepared: DevPreparedRuntime): Promise<DevApiRuntimeServerHandle> {
    const runtimeEnvironment = this.session.consumerEnvLoader.mergeIntoProcessEnvironment(
      process.env,
      prepared.consumerEnv,
    );
    const publicBaseUrl = `http://127.0.0.1:${prepared.gatewayPort}`;
    return await this.devApiRuntimeFactory.create({
      configPathOverride: prepared.configPathOverride,
      consumerRoot: prepared.paths.consumerRoot,
      runtimeWorkingDirectory: process.cwd(),
      env: {
        ...runtimeEnvironment,
        CODEMATION_DEV_SERVER_TOKEN: prepared.developmentServerToken,
        CODEMATION_SKIP_STARTUP_MIGRATIONS: "true",
        NODE_OPTIONS: this.session.developmentConditionNodeOptions.appendToNodeOptions(
          this.session.sourceMapNodeOptions.appendToNodeOptions(process.env.NODE_OPTIONS),
        ),
        WS_NO_BUFFER_UTIL: "1",
        WS_NO_UTF_8_VALIDATE: "1",
        ...(runtimeEnvironment.AUTH_URL ? {} : { AUTH_URL: publicBaseUrl }),
        ...(runtimeEnvironment.BETTER_AUTH_URL ? {} : { BETTER_AUTH_URL: publicBaseUrl }),
        ...(runtimeEnvironment.CODEMATION_PUBLIC_BASE_URL ? {} : { CODEMATION_PUBLIC_BASE_URL: publicBaseUrl }),
      },
    });
  }

  private async publishConsumerArtifacts(paths: CliPaths, configPathOverride?: string): Promise<void> {
    const builder = this.consumerOutputBuilderFactory.create(paths.consumerRoot, {
      configPathOverride,
    });
    const snapshot = await builder.ensureBuilt();
    const discoveredPlugins = await this.pluginDiscovery.discover(paths.consumerRoot);
    await this.consumerBuildArtifactsPublisher.publish(snapshot, discoveredPlugins);
    this.cliLogger.debug(`Dev: consumer output published (${snapshot.buildVersion}).`);
  }
}
