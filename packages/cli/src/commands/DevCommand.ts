import type { Logger } from "@codemation/host/next/server";
import { CodemationPluginDiscovery } from "@codemation/host/server";
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import type { DatabaseMigrationsApplyService } from "../database/DatabaseMigrationsApplyService";
import type { DevBootstrapSummaryFetcher } from "../dev/DevBootstrapSummaryFetcher";
import type { DevCliBannerRenderer } from "../dev/DevCliBannerRenderer";
import type { DevConsumerPublishBootstrap } from "../dev/DevConsumerPublishBootstrap";
import { ConsumerEnvDotenvFilePredicate } from "../dev/ConsumerEnvDotenvFilePredicate";
import type { DevSourceWatcher } from "../dev/DevSourceWatcher";
import { DevSessionServices } from "../dev/DevSessionServices";
import { DevLockFactory } from "../dev/Factory";
import { DevTrackedProcessTreeKiller } from "../dev/DevTrackedProcessTreeKiller";
import { DevSourceWatcherFactory } from "../dev/Runner";
import { CliPathResolver, type CliPaths } from "../path/CliPathResolver";
import { TypeScriptRuntimeConfigurator } from "../runtime/TypeScriptRuntimeConfigurator";
import { NextHostConsumerServerCommandFactory } from "../runtime/NextHostConsumerServerCommandFactory";

import type { DevResolvedAuthSettings } from "../dev/DevAuthSettingsLoader";

import type { DevMode, DevMutableProcessState, DevPreparedRuntime } from "./devCommandLifecycle.types";

export class DevCommand {
  private readonly require = createRequire(import.meta.url);

  constructor(
    private readonly pathResolver: CliPathResolver,
    private readonly pluginDiscovery: CodemationPluginDiscovery,
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
    try {
      const prepared = await this.prepareDevRuntime(paths, devMode, nextPort, gatewayPort, authSettings);
      const stopPromise = this.wireStopPromise(processState);
      const uiProxyBase = await this.startPackagedUiWhenNeeded(prepared, processState);
      const gatewayBaseUrl = this.gatewayBaseHttpUrl(gatewayPort);
      await this.spawnGatewayChildAndWaitForHealth(prepared, processState, gatewayBaseUrl, uiProxyBase);
      await this.session.devHttpProbe.waitUntilBootstrapSummaryReady(gatewayBaseUrl);
      const initialSummary = await this.devBootstrapSummaryFetcher.fetch(gatewayBaseUrl);
      if (initialSummary) {
        this.devCliBannerRenderer.renderRuntimeSummary(initialSummary);
      }
      this.bindShutdownSignalsToChildProcesses(processState);
      await this.spawnDevUiWhenNeeded(prepared, processState, gatewayBaseUrl);
      await this.startWatcherForSourceRestart(prepared, processState, watcher, devMode, gatewayBaseUrl);
      this.logPackagedUiDevHintWhenNeeded(devMode, gatewayPort);
      await stopPromise;
    } finally {
      processState.stopRequested = true;
      await this.stopLiveChildProcesses(processState);
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
    const gatewayEntrypoint = await this.session.runtimeEntrypointResolver.resolve({
      packageName: "@codemation/dev-gateway",
      repoRoot: paths.repoRoot,
      sourceEntrypoint: "packages/dev-gateway/src/bin.ts",
    });
    const runtimeEntrypoint = await this.session.runtimeEntrypointResolver.resolve({
      packageName: "@codemation/runtime-dev",
      repoRoot: paths.repoRoot,
      sourceEntrypoint: "packages/runtime-dev/src/bin.ts",
    });
    const runtimeWorkingDirectory = paths.repoRoot ?? paths.consumerRoot;
    const consumerEnv = this.session.consumerEnvLoader.load(paths.consumerRoot);
    const discoveredPluginPackagesJson = JSON.stringify(await this.pluginDiscovery.discover(paths.consumerRoot));
    return {
      paths,
      devMode,
      nextPort,
      gatewayPort,
      authSettings,
      developmentServerToken,
      gatewayEntrypoint,
      runtimeEntrypoint,
      runtimeWorkingDirectory,
      discoveredPluginPackagesJson,
      consumerEnv,
    };
  }

  private createInitialProcessState(): DevMutableProcessState {
    return {
      currentGateway: null,
      currentDevUi: null,
      currentPackagedUi: null,
      currentPackagedUiBaseUrl: null,
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

  /**
   * Default dev path: run packaged `next start` for the host UI and wait until it responds, so the gateway can proxy to it.
   * Framework watch mode: no separate packaged UI child (`next dev` starts later).
   */
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
      if (state.currentGateway?.exitCode === null) {
        void this.devTrackedProcessTreeKiller.killProcessTreeRootedAt(state.currentGateway);
      }
      state.stopReject?.(new Error(`next start (packaged UI) exited unexpectedly with code ${code ?? 0}.`));
    });
    await this.session.devHttpProbe.waitUntilUrlRespondsOk(`${uiProxyBase}/`);
  }

  private async spawnGatewayChildAndWaitForHealth(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    gatewayBaseUrl: string,
    uiProxyBase: string,
  ): Promise<void> {
    const gatewayProcessEnv = this.session.consumerEnvLoader.mergeIntoProcessEnvironment(
      process.env,
      prepared.consumerEnv,
    );
    state.currentGateway = spawn(prepared.gatewayEntrypoint.command, prepared.gatewayEntrypoint.args, {
      cwd: prepared.runtimeWorkingDirectory,
      ...this.devDetachedChildSpawnOptions(),
      env: {
        ...gatewayProcessEnv,
        ...prepared.gatewayEntrypoint.env,
        CODEMATION_DEV_GATEWAY_HTTP_PORT: String(prepared.gatewayPort),
        CODEMATION_RUNTIME_CHILD_BIN: prepared.runtimeEntrypoint.command,
        CODEMATION_RUNTIME_CHILD_ARGS_JSON: JSON.stringify(prepared.runtimeEntrypoint.args),
        CODEMATION_RUNTIME_CHILD_ENV_JSON: JSON.stringify(prepared.runtimeEntrypoint.env),
        CODEMATION_RUNTIME_CHILD_CWD: prepared.runtimeWorkingDirectory,
        CODEMATION_CONSUMER_ROOT: prepared.paths.consumerRoot,
        CODEMATION_DISCOVERED_PLUGIN_PACKAGES_JSON: prepared.discoveredPluginPackagesJson,
        CODEMATION_PREFER_PLUGIN_SOURCE_ENTRY: "true",
        CODEMATION_DEV_SERVER_TOKEN: prepared.developmentServerToken,
        CODEMATION_SKIP_STARTUP_MIGRATIONS: "true",
        NODE_OPTIONS: this.session.sourceMapNodeOptions.appendToNodeOptions(process.env.NODE_OPTIONS),
        WS_NO_BUFFER_UTIL: "1",
        WS_NO_UTF_8_VALIDATE: "1",
        ...(uiProxyBase.length > 0 ? { CODEMATION_DEV_UI_PROXY_TARGET: uiProxyBase } : {}),
      },
    });
    state.currentGateway.on("error", (error) => {
      if (!state.stopRequested) {
        state.stopRequested = true;
        state.stopReject?.(error instanceof Error ? error : new Error(String(error)));
      }
    });
    state.currentGateway.on("exit", (code) => {
      if (state.stopRequested) {
        return;
      }
      state.stopRequested = true;
      state.stopReject?.(new Error(`codemation dev-gateway exited unexpectedly with code ${code ?? 0}.`));
    });
    await this.session.devHttpProbe.waitUntilGatewayHealthy(gatewayBaseUrl);
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

  private bindShutdownSignalsToChildProcesses(state: DevMutableProcessState): void {
    let shutdownInProgress = false;
    const runShutdown = async (): Promise<void> => {
      if (shutdownInProgress) {
        return;
      }
      shutdownInProgress = true;
      state.stopRequested = true;
      process.stdout.write("\n[codemation] Stopping..\n");
      const children: ChildProcess[] = [];
      for (const child of [state.currentPackagedUi, state.currentDevUi, state.currentGateway]) {
        if (child && child.exitCode === null && child.signalCode === null) {
          children.push(child);
        }
      }
      await Promise.all(children.map((child) => this.devTrackedProcessTreeKiller.killProcessTreeRootedAt(child)));
      process.stdout.write("[codemation] Stopped.\n");
      state.stopResolve?.();
    };
    for (const signal of ["SIGINT", "SIGTERM", "SIGQUIT"] as const) {
      process.on(signal, () => {
        void runShutdown();
      });
    }
  }

  /**
   * Framework watch mode: run `next dev` for the Next host with HMR, pointed at the dev gateway runtime URL.
   */
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
        if (state.currentGateway?.exitCode === null) {
          void this.devTrackedProcessTreeKiller.killProcessTreeRootedAt(state.currentGateway);
        }
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
  ): Promise<void> {
    await watcher.start({
      roots: this.session.watchRootsResolver.resolve({
        consumerRoot: prepared.paths.consumerRoot,
        devMode,
        repoRoot: prepared.paths.repoRoot,
      }),
      onChange: async ({ changedPaths }) => {
        if (changedPaths.length > 0 && changedPaths.every((p) => this.consumerEnvDotenvFilePredicate.matches(p))) {
          process.stdout.write(
            "\n[codemation] Consumer environment file changed (e.g. .env). Restart the `codemation dev` process so the gateway and runtime pick up updated variables (host `process.env` does not hot-reload).\n",
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
              ? "\n[codemation] Source change detected — rebuilding consumer, restarting runtime, and restarting the UI…\n"
              : "\n[codemation] Source change detected — rebuilding consumer and restarting runtime…\n",
          );
          if (shouldRepublishConsumerOutput) {
            await this.devConsumerPublishBootstrap.ensurePublished(prepared.paths);
          }
          await this.session.sourceRestartCoordinator.runHandshakeAfterSourceChange(
            gatewayBaseUrl,
            prepared.developmentServerToken,
          );
          process.stdout.write("[codemation] Waiting for runtime to accept traffic…\n");
          await this.session.devHttpProbe.waitUntilBootstrapSummaryReady(gatewayBaseUrl);
          if (shouldRestartUi) {
            await this.restartUiAfterSourceChange(prepared, state, gatewayBaseUrl);
          }
          const json = await this.devBootstrapSummaryFetcher.fetch(gatewayBaseUrl);
          if (json) {
            this.devCliBannerRenderer.renderCompact(json);
          }
          process.stdout.write("[codemation] Runtime ready.\n");
        } catch (error) {
          await this.failDevSessionAfterIrrecoverableSourceError(state, error);
        }
      },
    });
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
    error: unknown,
  ): Promise<void> {
    const exception = error instanceof Error ? error : new Error(String(error));
    state.stopRequested = true;
    await this.stopLiveChildProcesses(state);
    state.stopReject?.(exception);
  }

  private async stopLiveChildProcesses(state: DevMutableProcessState): Promise<void> {
    const children: ChildProcess[] = [];
    for (const child of [state.currentPackagedUi, state.currentDevUi, state.currentGateway]) {
      if (child && child.exitCode === null && child.signalCode === null) {
        children.push(child);
      }
    }
    await Promise.all(children.map((child) => this.devTrackedProcessTreeKiller.killProcessTreeRootedAt(child)));
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
