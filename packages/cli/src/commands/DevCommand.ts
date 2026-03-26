import type { Logger } from "@codemation/host/next/server";
import { CodemationPluginDiscovery } from "@codemation/host/server";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

import type { DatabaseMigrationsApplyService } from "../database/DatabaseMigrationsApplyService";
import type { DevSourceWatcher } from "../dev/DevSourceWatcher";
import { DevSessionServices } from "../dev/DevSessionServices";
import { DevLockFactory } from "../dev/Factory";
import { DevSourceWatcherFactory } from "../dev/Runner";
import { CliPathResolver, type CliPaths } from "../path/CliPathResolver";
import { TypeScriptRuntimeConfigurator } from "../runtime/TypeScriptRuntimeConfigurator";

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
  ) {}

  async execute(consumerRoot: string): Promise<void> {
    const paths = await this.pathResolver.resolve(consumerRoot);
    this.tsRuntime.configure(paths.repoRoot);
    await this.databaseMigrationsApplyService.applyForConsumer(paths.consumerRoot);
    const devMode = this.resolveDevModeFromEnv();
    const { nextPort, gatewayPort } = await this.session.sessionPorts.resolve({
      devMode,
      portEnv: process.env.PORT,
      gatewayPortEnv: process.env.CODEMATION_DEV_GATEWAY_HTTP_PORT,
    });
    const devLock = this.devLockFactory.create();
    await devLock.acquire({
      consumerRoot: paths.consumerRoot,
      nextPort: devMode === "framework" ? nextPort : gatewayPort,
    });
    const authSettings = await this.session.devAuthLoader.loadForConsumer(paths.consumerRoot);
    const watcher = this.devSourceWatcherFactory.create();
    try {
      const prepared = await this.prepareDevRuntime(paths, devMode, nextPort, gatewayPort, authSettings);
      const processState = this.createInitialProcessState();
      const stopPromise = this.wireStopPromise(processState);
      const uiProxyBase = await this.startConsumerUiProxyWhenNeeded(prepared, processState);
      const gatewayBaseUrl = this.gatewayBaseHttpUrl(gatewayPort);
      await this.spawnGatewayChildAndWaitForHealth(prepared, processState, gatewayBaseUrl, uiProxyBase);
      this.bindShutdownSignalsToChildProcesses(processState);
      this.spawnFrameworkNextHostWhenNeeded(prepared, processState, gatewayBaseUrl);
      await this.startWatcherForSourceRestart(prepared, watcher, devMode, gatewayBaseUrl);
      this.logConsumerDevHintWhenNeeded(devMode, gatewayPort);
      await stopPromise;
    } finally {
      await watcher.stop();
      await devLock.release();
    }
  }

  private resolveDevModeFromEnv(): DevMode {
    return process.env.CODEMATION_DEV_MODE === "framework" ? "framework" : "consumer";
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
      currentNextHost: null,
      currentUiNext: null,
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
   * Consumer mode: run `next start` for the host UI and wait until it responds, so the gateway can proxy to it.
   * Framework mode: no separate UI child (Next runs in dev later).
   */
  private async startConsumerUiProxyWhenNeeded(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
  ): Promise<string> {
    if (prepared.devMode !== "consumer") {
      return "";
    }
    const websocketPort = prepared.gatewayPort;
    const uiPort = await this.session.loopbackPortAllocator.allocate();
    const uiProxyBase = `http://127.0.0.1:${uiPort}`;
    const nextHostPackageJsonPath = this.require.resolve("@codemation/next-host/package.json");
    const nextHostRoot = path.dirname(nextHostPackageJsonPath);
    state.currentUiNext = spawn("pnpm", ["exec", "next", "start"], {
      cwd: nextHostRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        ...prepared.consumerEnv,
        PORT: String(uiPort),
        CODEMATION_AUTH_CONFIG_JSON: prepared.authSettings.authConfigJson,
        CODEMATION_CONSUMER_ROOT: prepared.paths.consumerRoot,
        CODEMATION_SKIP_UI_AUTH: prepared.authSettings.skipUiAuth ? "true" : "false",
        NEXT_PUBLIC_CODEMATION_SKIP_UI_AUTH: prepared.authSettings.skipUiAuth ? "true" : "false",
        CODEMATION_WS_PORT: String(websocketPort),
        NEXT_PUBLIC_CODEMATION_WS_PORT: String(websocketPort),
        CODEMATION_DEV_SERVER_TOKEN: prepared.developmentServerToken,
        NODE_OPTIONS: this.session.sourceMapNodeOptions.appendToNodeOptions(process.env.NODE_OPTIONS),
        WS_NO_BUFFER_UTIL: "1",
        WS_NO_UTF_8_VALIDATE: "1",
      },
    });
    state.currentUiNext.on("error", (error) => {
      if (!state.stopRequested) {
        state.stopRequested = true;
        state.stopReject?.(error instanceof Error ? error : new Error(String(error)));
      }
    });
    state.currentUiNext.on("exit", (code) => {
      if (state.stopRequested) {
        return;
      }
      state.stopRequested = true;
      if (state.currentGateway?.exitCode === null) {
        state.currentGateway.kill("SIGTERM");
      }
      state.stopReject?.(new Error(`next start (consumer UI) exited unexpectedly with code ${code ?? 0}.`));
    });
    await this.session.devHttpProbe.waitUntilUrlRespondsOk(`${uiProxyBase}/`);
    return uiProxyBase;
  }

  private async spawnGatewayChildAndWaitForHealth(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    gatewayBaseUrl: string,
    uiProxyBase: string,
  ): Promise<void> {
    state.currentGateway = spawn(prepared.gatewayEntrypoint.command, prepared.gatewayEntrypoint.args, {
      cwd: prepared.runtimeWorkingDirectory,
      stdio: "inherit",
      env: {
        ...process.env,
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
        DATABASE_URL: process.env.DATABASE_URL,
        AUTH_SECRET: process.env.AUTH_SECRET,
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

  private bindShutdownSignalsToChildProcesses(state: DevMutableProcessState): void {
    for (const signal of ["SIGINT", "SIGTERM", "SIGQUIT"] as const) {
      process.on(signal, () => {
        state.stopRequested = true;
        if (state.currentUiNext?.exitCode === null) {
          state.currentUiNext.kill(signal);
        }
        if (state.currentNextHost?.exitCode === null) {
          state.currentNextHost.kill(signal);
        }
        if (state.currentGateway?.exitCode === null) {
          state.currentGateway.kill(signal);
        }
        state.stopResolve?.();
      });
    }
  }

  /**
   * Framework mode: run `next dev` for the Next host with HMR, pointed at the dev gateway runtime URL.
   */
  private spawnFrameworkNextHostWhenNeeded(
    prepared: DevPreparedRuntime,
    state: DevMutableProcessState,
    gatewayBaseUrl: string,
  ): void {
    if (prepared.devMode !== "framework") {
      return;
    }
    const websocketPort = prepared.gatewayPort;
    const nextHostPackageJsonPath = this.require.resolve("@codemation/next-host/package.json");
    const nextHostRoot = path.dirname(nextHostPackageJsonPath);
    const nextHostEnvironment = this.session.nextHostEnvBuilder.build({
      authConfigJson: prepared.authSettings.authConfigJson,
      consumerRoot: prepared.paths.consumerRoot,
      developmentServerToken: prepared.developmentServerToken,
      nextPort: prepared.nextPort,
      skipUiAuth: prepared.authSettings.skipUiAuth,
      websocketPort,
      runtimeDevUrl: gatewayBaseUrl,
    });
    state.currentNextHost = spawn("pnpm", ["exec", "next", "dev"], {
      cwd: nextHostRoot,
      stdio: "inherit",
      env: nextHostEnvironment,
    });
    state.currentNextHost.on("exit", (code) => {
      const normalizedCode = code ?? 0;
      if (state.stopRequested) {
        return;
      }
      if (normalizedCode === 0) {
        state.stopRequested = true;
        if (state.currentGateway?.exitCode === null) {
          state.currentGateway.kill("SIGTERM");
        }
        state.stopResolve?.();
        return;
      }
      state.stopRequested = true;
      state.stopReject?.(new Error(`next host exited with code ${normalizedCode}.`));
    });
    state.currentNextHost.on("error", (error) => {
      if (!state.stopRequested) {
        state.stopRequested = true;
        state.stopReject?.(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private async startWatcherForSourceRestart(
    prepared: DevPreparedRuntime,
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
      onChange: async () => {
        await this.session.sourceRestartCoordinator.runHandshakeAfterSourceChange(
          gatewayBaseUrl,
          prepared.developmentServerToken,
        );
      },
    });
  }

  private logConsumerDevHintWhenNeeded(devMode: DevMode, gatewayPort: number): void {
    if (devMode !== "consumer") {
      return;
    }
    this.cliLogger.info(
      `codemation dev (consumer): open http://127.0.0.1:${gatewayPort} — requires a built @codemation/next-host (next build). For Next HMR use CODEMATION_DEV_MODE=framework.`,
    );
  }
}
