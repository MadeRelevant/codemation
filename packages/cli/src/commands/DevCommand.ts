import type { Logger } from "@codemation/host/next/server";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import type { DatabaseMigrationsApplyService } from "../database/DatabaseMigrationsApplyService";
import type { DevApiRuntimeFactory, DevApiRuntimeServerHandle } from "../dev/DevApiRuntimeFactory";
import type { DevBootstrapSummaryFetcher } from "../dev/DevBootstrapSummaryFetcher";
import type { CliDevProxyServer } from "../dev/CliDevProxyServer";
import type { CliDevProxyServerFactory } from "../dev/CliDevProxyServerFactory";
import type { DevCliBannerRenderer } from "../dev/DevCliBannerRenderer";
import type { DevConsumerPublishBootstrap } from "../dev/DevConsumerPublishBootstrap";
import { ConsumerEnvDotenvFilePredicate } from "../dev/ConsumerEnvDotenvFilePredicate";
import type { DevRebuildQueueFactory } from "../dev/DevRebuildQueueFactory";
import type { DevSourceWatcher } from "../dev/DevSourceWatcher";
import { DevSessionServices } from "../dev/DevSessionServices";
import { DevLockFactory } from "../dev/Factory";
import { DevTrackedProcessTreeKiller } from "../dev/DevTrackedProcessTreeKiller";
import { DevSourceWatcherFactory } from "../dev/Runner";
import type { DevResolvedAuthSettings } from "../dev/DevAuthSettingsLoader";
import { CliPathResolver, type CliPaths } from "../path/CliPathResolver";
import { NextHostConsumerServerCommandFactory } from "../runtime/NextHostConsumerServerCommandFactory";
import { TypeScriptRuntimeConfigurator } from "../runtime/TypeScriptRuntimeConfigurator";

import type { DevMode, DevMutableProcessState, DevPreparedRuntime } from "./devCommandLifecycle.types";

export class DevCommand {
  private readonly require = createRequire(import.meta.url);

  constructor(
    private readonly pathResolver: CliPathResolver,
    private readonly tsRuntime: TypeScriptRuntimeConfigurator,
    private readonly devLockFactory: DevLockFactory,
    private readonly devSourceWatcherFactory: DevSourceWatcherFactory,
    private readonly cliLogger: Logger,
    private readonly session: DevSessionServices,
    private readonly databaseMigrationsApplyService: DatabaseMigrationsApplyService,
    private readonly devBootstrapSummaryFetcher: DevBootstrapSummaryFetcher,
    private readonly devCliBannerRenderer: DevCliBannerRenderer,
    private readonly devConsumerPublishBootstrap: DevConsumerPublishBootstrap,
    private readonly consumerEnvDotenvFilePredicate: ConsumerEnvDotenvFilePredicate,
    private readonly devTrackedProcessTreeKiller: DevTrackedProcessTreeKiller,
    private readonly nextHostConsumerServerCommandFactory: NextHostConsumerServerCommandFactory,
    private readonly devApiRuntimeFactory: DevApiRuntimeFactory,
    private readonly cliDevProxyServerFactory: CliDevProxyServerFactory,
    private readonly devRebuildQueueFactory: DevRebuildQueueFactory,
  ) {}

  async execute(args: Readonly<{ consumerRoot: string; watchFramework?: boolean }>): Promise<void> {
    const paths = await this.pathResolver.resolve(args.consumerRoot);
    this.devCliBannerRenderer.renderBrandHeader();
    this.tsRuntime.configure(paths.repoRoot);
    await this.databaseMigrationsApplyService.applyForConsumer(paths.consumerRoot);
    await this.devConsumerPublishBootstrap.ensurePublished(paths);
    const devMode = this.resolveDevMode(args);
    const { nextPort, gatewayPort } = await this.session.sessionPorts.resolve({
      devMode,
      portEnv: process.env.PORT,
      gatewayPortEnv: process.env.CODEMATION_DEV_GATEWAY_HTTP_PORT,
    });
    const devLock = this.devLockFactory.create();
    await devLock.acquire({
      consumerRoot: paths.consumerRoot,
      nextPort: devMode === "watch-framework" ? nextPort : gatewayPort,
    });
    const authSettings = await this.session.devAuthLoader.loadForConsumer(paths.consumerRoot);
    const watcher = this.devSourceWatcherFactory.create();
    const processState = this.createInitialProcessState();
    let proxyServer: CliDevProxyServer | null = null;
    try {
      const prepared = await this.prepareDevRuntime(paths, devMode, nextPort, gatewayPort, authSettings);
      const stopPromise = this.wireStopPromise(processState);
      const uiProxyBase = await this.startPackagedUiWhenNeeded(prepared, processState);
      proxyServer = await this.startProxyServer(prepared.gatewayPort, uiProxyBase);
      const gatewayBaseUrl = this.gatewayBaseHttpUrl(gatewayPort);
      await this.bootInitialRuntime(prepared, processState, proxyServer);
      await this.session.devHttpProbe.waitUntilBootstrapSummaryReady(gatewayBaseUrl);
      const initialSummary = await this.devBootstrapSummaryFetcher.fetch(gatewayBaseUrl);
      if (initialSummary) {
        this.devCliBannerRenderer.renderRuntimeSummary(initialSummary);
      }
      this.bindShutdownSignalsToChildProcesses(processState, proxyServer);
      await this.spawnDevUiWhenNeeded(prepared, processState, gatewayBaseUrl);
      await this.startWatcherForSourceRestart(prepared, processState, watcher, devMode, gatewayBaseUrl, proxyServer);
      this.logPackagedUiDevHintWhenNeeded(devMode, gatewayPort);
      await stopPromise;
    } finally {
      processState.stopRequested = true;
      await this.stopLiveProcesses(processState, proxyServer);
      await watcher.stop();
      await devLock.release();
    }
  }

  private resolveDevMode(args: Readonly<{ watchFramework?: boolean }>): DevMode {
    if (args.watchFramework === true || process.env.CODEMATION_DEV_MODE === "framework") {
      return "watch-framework";
    }
    return "packaged-ui";
  }

  private async prepareDevRuntime(
    paths: CliPaths,
    devMode: DevMode,
    nextPort: number,
    gatewayPort: number,
    authSettings: DevResolvedAuthSettings,
  ): Promise<DevPreparedRuntime> {
    const developmentServerToken = this.session.devAuthLoader.resolveDevelopmentServerToken(
      process.env.CODEMATION_DEV_SERVER_TOKEN,
    );
    const consumerEnv = this.session.consumerEnvLoader.load(paths.consumerRoot);
    return {
      paths,
      devMode,
      nextPort,
      gatewayPort,
      authSettings,
      developmentServerToken,
      consumerEnv,
    };
  }

  private createInitialProcessState(): DevMutableProcessState {
    return {
      currentDevUi: null,
      currentPackagedUi: null,
      currentPackagedUiBaseUrl: null,
      currentRuntime: null,
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

  private async startPackagedUiWhenNeeded(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
  ): Promise<string> {
    if (prepared.devMode !== "packaged-ui") {
      return "";
    }
    const websocketPort = prepared.gatewayPort;
    const uiProxyBase =
      state.currentPackagedUiBaseUrl ?? `http://127.0.0.1:${await this.session.loopbackPortAllocator.allocate()}`;
    state.currentPackagedUiBaseUrl = uiProxyBase;
    await this.spawnPackagedUi(prepared, state, prepared.authSettings, websocketPort, uiProxyBase);
    return uiProxyBase;
  }

  private async spawnPackagedUi(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    authSettings: DevResolvedAuthSettings,
    websocketPort: number,
    uiProxyBase: string,
  ): Promise<void> {
    const nextHostPackageJsonPath = this.require.resolve("@codemation/next-host/package.json");
    const nextHostRoot = path.dirname(nextHostPackageJsonPath);
    const nextHostCommand = await this.nextHostConsumerServerCommandFactory.create({ nextHostRoot });
    const consumerOutputManifestPath = path.resolve(
      prepared.paths.consumerRoot,
      ".codemation",
      "output",
      "current.json",
    );
    const uiPort = Number(new URL(uiProxyBase).port);
    const nextHostEnvironment = this.session.nextHostEnvBuilder.buildConsumerUiProxy({
      authConfigJson: authSettings.authConfigJson,
      authSecret: authSettings.authSecret,
      consumerRoot: prepared.paths.consumerRoot,
      consumerOutputManifestPath,
      developmentServerToken: prepared.developmentServerToken,
      nextPort: uiPort,
      publicBaseUrl: this.gatewayBaseHttpUrl(prepared.gatewayPort),
      runtimeDevUrl: this.gatewayBaseHttpUrl(prepared.gatewayPort),
      skipUiAuth: authSettings.skipUiAuth,
      websocketPort,
    });
    state.currentPackagedUi = spawn(nextHostCommand.command, nextHostCommand.args, {
      cwd: nextHostCommand.cwd,
      ...this.devDetachedChildSpawnOptions(),
      env: nextHostEnvironment,
    });
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
    await this.session.devHttpProbe.waitUntilUrlRespondsOk(`${uiProxyBase}/`);
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
    const runtime = await this.createRuntime(prepared);
    state.currentRuntime = runtime;
    await proxyServer.activateRuntime({
      httpPort: runtime.httpPort,
      workflowWebSocketPort: runtime.workflowWebSocketPort,
    });
    proxyServer.setBuildStatus("idle");
  }

  private devDetachedChildSpawnOptions(): Readonly<{
    stdio: "inherit";
    detached: boolean;
    windowsHide?: boolean;
  }> {
    return process.platform === "win32"
      ? { stdio: "inherit", detached: true, windowsHide: true }
      : { stdio: "inherit", detached: true };
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
    authSettings: DevResolvedAuthSettings,
  ): Promise<void> {
    const websocketPort = prepared.gatewayPort;
    const nextHostPackageJsonPath = this.require.resolve("@codemation/next-host/package.json");
    const nextHostRoot = path.dirname(nextHostPackageJsonPath);
    const nextHostEnvironment = this.session.nextHostEnvBuilder.build({
      authConfigJson: authSettings.authConfigJson,
      consumerRoot: prepared.paths.consumerRoot,
      developmentServerToken: prepared.developmentServerToken,
      nextPort: prepared.nextPort,
      skipUiAuth: authSettings.skipUiAuth,
      websocketPort,
      runtimeDevUrl: gatewayBaseUrl,
    });
    state.currentDevUi = spawn("pnpm", ["exec", "next", "dev"], {
      cwd: nextHostRoot,
      ...this.devDetachedChildSpawnOptions(),
      env: nextHostEnvironment,
    });
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
    await this.session.devHttpProbe.waitUntilUrlRespondsOk(`http://127.0.0.1:${prepared.nextPort}/`);
  }

  private async startWatcherForSourceRestart(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    watcher: DevSourceWatcher,
    devMode: DevMode,
    gatewayBaseUrl: string,
    proxyServer: CliDevProxyServer,
  ): Promise<void> {
    const rebuildQueue = this.devRebuildQueueFactory.create({
      run: async (request) => {
        await this.runQueuedRebuild(prepared, state, gatewayBaseUrl, proxyServer, request);
      },
    });
    await watcher.start({
      roots: this.session.watchRootsResolver.resolve({
        consumerRoot: prepared.paths.consumerRoot,
        devMode,
        repoRoot: prepared.paths.repoRoot,
      }),
      onChange: async ({ changedPaths }) => {
        if (changedPaths.length > 0 && changedPaths.every((p) => this.consumerEnvDotenvFilePredicate.matches(p))) {
          process.stdout.write(
            "\n[codemation] Consumer environment file changed (e.g. .env). Restart the `codemation dev` process so the runtime picks up updated variables (host `process.env` does not hot-reload).\n",
          );
          return;
        }
        try {
          const shouldRepublishConsumerOutput = this.session.sourceChangeClassifier.shouldRepublishConsumerOutput({
            changedPaths,
            consumerRoot: prepared.paths.consumerRoot,
          });
          const shouldRestartUi = this.session.sourceChangeClassifier.requiresUiRestart({
            changedPaths,
            consumerRoot: prepared.paths.consumerRoot,
          });
          process.stdout.write(
            shouldRestartUi
              ? "\n[codemation] Source change detected — rebuilding consumer, restarting the runtime, and restarting the UI…\n"
              : "\n[codemation] Source change detected — rebuilding consumer and restarting the runtime…\n",
          );
          await rebuildQueue.enqueue({
            changedPaths,
            shouldRepublishConsumerOutput,
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
      shouldRepublishConsumerOutput: boolean;
      shouldRestartUi: boolean;
    }>,
  ): Promise<void> {
    void request.changedPaths;
    proxyServer.setBuildStatus("building");
    proxyServer.broadcastBuildStarted();
    try {
      if (request.shouldRepublishConsumerOutput) {
        await this.devConsumerPublishBootstrap.ensurePublished(prepared.paths);
      }
      await this.stopCurrentRuntime(state, proxyServer);
      process.stdout.write("[codemation] Waiting for runtime to accept traffic…\n");
      const runtime = await this.createRuntime(prepared);
      state.currentRuntime = runtime;
      await proxyServer.activateRuntime({
        httpPort: runtime.httpPort,
        workflowWebSocketPort: runtime.workflowWebSocketPort,
      });
      if (request.shouldRestartUi) {
        await this.restartUiAfterSourceChange(prepared, state, gatewayBaseUrl);
      }
      await this.session.devHttpProbe.waitUntilBootstrapSummaryReady(gatewayBaseUrl);
      const json = await this.devBootstrapSummaryFetcher.fetch(gatewayBaseUrl);
      if (json) {
        this.devCliBannerRenderer.renderCompact(json);
      }
      proxyServer.setBuildStatus("idle");
      proxyServer.broadcastBuildCompleted(runtime.buildVersion);
      process.stdout.write("[codemation] Runtime ready.\n");
    } catch (error) {
      proxyServer.setBuildStatus("idle");
      proxyServer.broadcastBuildFailed(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async restartUiAfterSourceChange(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    gatewayBaseUrl: string,
  ): Promise<void> {
    const refreshedAuthSettings = await this.session.devAuthLoader.loadForConsumer(prepared.paths.consumerRoot);
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
    authSettings: DevResolvedAuthSettings,
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
    authSettings: DevResolvedAuthSettings,
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
    for (const child of [state.currentPackagedUi, state.currentDevUi]) {
      if (child && child.exitCode === null && child.signalCode === null) {
        children.push(child);
      }
    }
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
    return await this.devApiRuntimeFactory.create({
      consumerRoot: prepared.paths.consumerRoot,
      runtimeWorkingDirectory: process.cwd(),
      env: {
        ...runtimeEnvironment,
        CODEMATION_DEV_SERVER_TOKEN: prepared.developmentServerToken,
        CODEMATION_SKIP_STARTUP_MIGRATIONS: "true",
        NODE_OPTIONS: this.session.sourceMapNodeOptions.appendToNodeOptions(process.env.NODE_OPTIONS),
        WS_NO_BUFFER_UTIL: "1",
        WS_NO_UTF_8_VALIDATE: "1",
      },
    });
  }

  private logPackagedUiDevHintWhenNeeded(devMode: DevMode, gatewayPort: number): void {
    if (devMode !== "packaged-ui") {
      return;
    }
    this.cliLogger.info(
      `codemation dev: open http://127.0.0.1:${gatewayPort} — this uses the packaged @codemation/next-host UI. Use \`codemation dev --watch-framework\` only when working on the framework UI itself.`,
    );
  }
}
