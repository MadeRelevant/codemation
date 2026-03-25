import { Command } from "commander";
import {
  CodemationConsumerConfigLoader,
  CodemationPluginDiscovery,
  type CodemationDiscoveredPluginPackage,
} from "@codemation/host/server";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { ApiPaths } from "@codemation/host";
import { logLevelPolicyFactory, ServerLoggerFactory } from "@codemation/host/next/server";
import { CodemationCliPathResolver } from "./CodemationCliPathResolver";
import { CodemationConsumerEnvLoader } from "./CodemationConsumerEnvLoader";
import {
  CodemationConsumerOutputBuilder,
  type CodemationConsumerOutputBuildSnapshot,
} from "./CodemationConsumerOutputBuilder";
import { CodemationDevSourceWatcher } from "./CodemationDevSourceWatcher";
import { CodemationDevLock } from "./CodemationDevLock";
import { CodemationLocalUserCreator } from "./CodemationLocalUserCreator";
type CodemationConsumerBuildManifest = Readonly<{
  buildVersion: string;
  consumerRoot: string;
  entryPath: string;
  manifestPath: string;
  pluginEntryPath: string;
  workflowSourcePaths: ReadonlyArray<string>;
}>;

export class CodemationCli {
  private readonly require = createRequire(import.meta.url);
  private readonly loggerFactory = new ServerLoggerFactory(logLevelPolicyFactory);
  private readonly cliLogger = this.loggerFactory.create("codemation-cli");
  private readonly performanceDiagnosticsLogger =
    this.loggerFactory.createPerformanceDiagnostics("codemation-cli.performance");

  constructor(
    private readonly pathResolver: CodemationCliPathResolver = new CodemationCliPathResolver(),
    private readonly pluginDiscovery: CodemationPluginDiscovery = new CodemationPluginDiscovery(),
    private readonly configLoader: CodemationConsumerConfigLoader = new CodemationConsumerConfigLoader(),
  ) {}

  async run(argv: ReadonlyArray<string>): Promise<void> {
    const program = new Command();
    program
      .name("codemation")
      .description("Build and run the Codemation Next host against a consumer project.")
      .version(this.readCliPackageVersion(), "-V, --version", "Output CLI version")
      .showHelpAfterError("(add --help for usage)")
      .configureHelp({ sortSubcommands: true });

    const resolveConsumerRoot = (raw: string | undefined): string =>
      raw !== undefined && raw.trim().length > 0 ? path.resolve(process.cwd(), raw.trim()) : process.cwd();

    program
      .command("build")
      .description("Build consumer workflows/plugins output and write the manifest.")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .action(async (opts: Readonly<{ consumerRoot?: string }>) => {
        await this.runBuild(resolveConsumerRoot(opts.consumerRoot));
      });

    program
      .command("dev", { isDefault: true })
      .description(
        "Start the dev gateway and runtime child. Use CODEMATION_DEV_MODE=framework with Next dev for framework UI HMR; default consumer mode serves API/WebSocket from the gateway only.",
      )
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .action(async (opts: Readonly<{ consumerRoot?: string }>) => {
        await this.runDev(resolveConsumerRoot(opts.consumerRoot));
      });

    const serve = program.command("serve").description("Run production web or worker processes (no dev watchers).");

    serve
      .command("web")
      .description("Start the built Next.js Codemation host (next start).")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .action(async (opts: Readonly<{ consumerRoot?: string }>) => {
        await this.runServeWeb(resolveConsumerRoot(opts.consumerRoot));
      });

    serve
      .command("worker")
      .description("Start the Codemation worker process.")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option("--config <path>", "Override path to codemation.config.ts / .js")
      .action(async (opts: Readonly<{ consumerRoot?: string; config?: string }>) => {
        await this.runServeWorker(resolveConsumerRoot(opts.consumerRoot), opts.config);
      });

    const user = program.command("user").description("User administration (local auth)");

    user
      .command("create")
      .description(
        'Create or update a user in the database when CodemationConfig.auth.kind is "local". Uses DATABASE_URL or configured database URL.',
      )
      .requiredOption("--email <email>", "Login email")
      .requiredOption("--password <password>", "Plain password (stored as a bcrypt hash)")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .option("--config <path>", "Override path to codemation.config.ts / .js")
      .action(
        async (
          opts: Readonly<{
            email: string;
            password: string;
            consumerRoot?: string;
            config?: string;
          }>,
        ) => {
          await new CodemationLocalUserCreator().run({
            consumerRoot:
              opts.consumerRoot !== undefined && opts.consumerRoot.trim().length > 0
                ? path.resolve(process.cwd(), opts.consumerRoot.trim())
                : undefined,
            configPath: opts.config && opts.config.trim().length > 0 ? opts.config.trim() : undefined,
            email: opts.email,
            password: opts.password,
          });
        },
      );

    await program.parseAsync(argv as string[], { from: "user" });
  }

  private readCliPackageVersion(): string {
    try {
      const packageJsonPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
      const parsed = JSON.parse(readFileSync(packageJsonPath, "utf8")) as { version?: unknown };
      return typeof parsed.version === "string" ? parsed.version : "0.0.0";
    } catch {
      return "0.0.0";
    }
  }

  private async runBuild(consumerRoot: string): Promise<void> {
    const paths = await this.pathResolver.resolve(consumerRoot);
    this.configureTypeScriptRuntime(paths.repoRoot);
    const builder = new CodemationConsumerOutputBuilder(paths.consumerRoot);
    const snapshot = await builder.ensureBuilt();
    const discoveredPlugins = await this.pluginDiscovery.discover(paths.consumerRoot);
    const manifest = await this.publishBuildArtifacts(snapshot, discoveredPlugins);
    await builder.pruneRetiredRevisions(manifest.buildVersion);
    this.cliLogger.info(`Built consumer output: ${snapshot.outputEntryPath}`);
    this.cliLogger.info(`Discovered plugins: ${discoveredPlugins.length}`);
    this.cliLogger.info(`Published revision: ${manifest.buildVersion}`);
  }

  private async runDev(consumerRoot: string): Promise<void> {
    const paths = await this.pathResolver.resolve(consumerRoot);
    this.configureTypeScriptRuntime(paths.repoRoot);
    const devMode = process.env.CODEMATION_DEV_MODE === "framework" ? "framework" : "consumer";
    const nextPort = this.resolveNextPort(process.env.PORT);
    const gatewayPort =
      this.parsePositiveInt(process.env.CODEMATION_DEV_GATEWAY_HTTP_PORT) ??
      (devMode === "consumer" ? nextPort : await this.resolveFreePortOnLoopback());
    const devLock = new CodemationDevLock();
    await devLock.acquire({
      consumerRoot: paths.consumerRoot,
      nextPort: devMode === "framework" ? nextPort : gatewayPort,
    });
    const authSettings = await this.resolveDevAuthSettings(paths.consumerRoot);
    const watcher = new CodemationDevSourceWatcher();
    try {
      const websocketPort = gatewayPort;
      const developmentServerToken = this.resolveDevelopmentServerToken(process.env.CODEMATION_DEV_SERVER_TOKEN);
      const gatewayEntrypoint = await this.resolveRuntimeToolEntrypoint({
        packageName: "@codemation/dev-gateway",
        repoRoot: paths.repoRoot,
        sourceEntrypoint: "packages/dev-gateway/src/bin.ts",
      });
      const runtimeEntrypoint = await this.resolveRuntimeToolEntrypoint({
        packageName: "@codemation/runtime-dev",
        repoRoot: paths.repoRoot,
        sourceEntrypoint: "packages/runtime-dev/src/bin.ts",
      });
      const runtimeWorkingDirectory = paths.repoRoot ?? paths.consumerRoot;
      let currentGateway: ReturnType<typeof spawn> | null = null;
      let currentNextHost: ReturnType<typeof spawn> | null = null;
      let currentUiNext: ReturnType<typeof spawn> | null = null;
      let stopRequested = false;
      let stopResolve: (() => void) | null = null;
      let stopReject: ((error: Error) => void) | null = null;
      const stopPromise = new Promise<void>((resolve, reject) => {
        stopResolve = resolve;
        stopReject = reject;
      });
      const consumerEnv = CodemationConsumerEnvLoader.load(paths.consumerRoot);
      const discoveredPluginPackagesJson = JSON.stringify(await this.pluginDiscovery.discover(paths.consumerRoot));
      let uiProxyBase = "";
      if (devMode === "consumer") {
        const uiPort = await this.resolveFreePortOnLoopback();
        uiProxyBase = `http://127.0.0.1:${uiPort}`;
        const nextHostPackageJsonPath = this.require.resolve("@codemation/next-host/package.json");
        const nextHostRoot = path.dirname(nextHostPackageJsonPath);
        currentUiNext = spawn("pnpm", ["exec", "next", "start"], {
          cwd: nextHostRoot,
          stdio: "inherit",
          env: {
            ...process.env,
            ...consumerEnv,
            PORT: String(uiPort),
            CODEMATION_AUTH_CONFIG_JSON: authSettings.authConfigJson,
            CODEMATION_CONSUMER_ROOT: paths.consumerRoot,
            CODEMATION_SKIP_UI_AUTH: authSettings.skipUiAuth ? "true" : "false",
            NEXT_PUBLIC_CODEMATION_SKIP_UI_AUTH: authSettings.skipUiAuth ? "true" : "false",
            CODEMATION_WS_PORT: String(websocketPort),
            NEXT_PUBLIC_CODEMATION_WS_PORT: String(websocketPort),
            CODEMATION_DEV_SERVER_TOKEN: developmentServerToken,
            NODE_OPTIONS: this.createNodeOptionsForSourceMaps(process.env.NODE_OPTIONS),
            WS_NO_BUFFER_UTIL: "1",
            WS_NO_UTF_8_VALIDATE: "1",
          },
        });
        currentUiNext.on("error", (error) => {
          if (!stopRequested) {
            stopRequested = true;
            stopReject?.(error instanceof Error ? error : new Error(String(error)));
          }
        });
        currentUiNext.on("exit", (code) => {
          if (stopRequested) {
            return;
          }
          stopRequested = true;
          if (currentGateway?.exitCode === null) {
            currentGateway.kill("SIGTERM");
          }
          stopReject?.(new Error(`next start (consumer UI) exited unexpectedly with code ${code ?? 0}.`));
        });
        await this.waitForHttpOk(`${uiProxyBase}/`);
      }
      const gatewayBaseUrl = `http://127.0.0.1:${gatewayPort}`;
      currentGateway = spawn(gatewayEntrypoint.command, gatewayEntrypoint.args, {
        cwd: runtimeWorkingDirectory,
        stdio: "inherit",
        env: {
          ...process.env,
          ...gatewayEntrypoint.env,
          CODEMATION_DEV_GATEWAY_HTTP_PORT: String(gatewayPort),
          CODEMATION_RUNTIME_CHILD_BIN: runtimeEntrypoint.command,
          CODEMATION_RUNTIME_CHILD_ARGS_JSON: JSON.stringify(runtimeEntrypoint.args),
          CODEMATION_RUNTIME_CHILD_ENV_JSON: JSON.stringify(runtimeEntrypoint.env),
          CODEMATION_RUNTIME_CHILD_CWD: runtimeWorkingDirectory,
          CODEMATION_CONSUMER_ROOT: paths.consumerRoot,
          CODEMATION_DISCOVERED_PLUGIN_PACKAGES_JSON: discoveredPluginPackagesJson,
          CODEMATION_PREFER_PLUGIN_SOURCE_ENTRY: "true",
          CODEMATION_DEV_SERVER_TOKEN: developmentServerToken,
          CODEMATION_SKIP_STARTUP_MIGRATIONS: "true",
          NODE_OPTIONS: this.createNodeOptionsForSourceMaps(process.env.NODE_OPTIONS),
          WS_NO_BUFFER_UTIL: "1",
          WS_NO_UTF_8_VALIDATE: "1",
          ...(uiProxyBase.length > 0 ? { CODEMATION_DEV_UI_PROXY_TARGET: uiProxyBase } : {}),
          DATABASE_URL: process.env.DATABASE_URL,
          AUTH_SECRET: process.env.AUTH_SECRET,
        },
      });
      currentGateway.on("error", (error) => {
        if (!stopRequested) {
          stopRequested = true;
          stopReject?.(error instanceof Error ? error : new Error(String(error)));
        }
      });
      currentGateway.on("exit", (code) => {
        if (stopRequested) {
          return;
        }
        stopRequested = true;
        stopReject?.(new Error(`codemation dev-gateway exited unexpectedly with code ${code ?? 0}.`));
      });
      await this.waitForGatewayReadiness(gatewayBaseUrl);
      for (const signal of ["SIGINT", "SIGTERM", "SIGQUIT"] as const) {
        process.on(signal, () => {
          stopRequested = true;
          if (currentUiNext?.exitCode === null) {
            currentUiNext.kill(signal);
          }
          if (currentNextHost?.exitCode === null) {
            currentNextHost.kill(signal);
          }
          if (currentGateway?.exitCode === null) {
            currentGateway.kill(signal);
          }
          stopResolve?.();
        });
      }
      if (devMode === "framework") {
        const nextHostPackageJsonPath = this.require.resolve("@codemation/next-host/package.json");
        const nextHostRoot = path.dirname(nextHostPackageJsonPath);
        const nextHostEnvironment = this.createNextHostEnvironment({
          authConfigJson: authSettings.authConfigJson,
          consumerRoot: paths.consumerRoot,
          developmentServerToken,
          nextPort,
          skipUiAuth: authSettings.skipUiAuth,
          websocketPort,
          runtimeDevUrl: gatewayBaseUrl,
        });
        currentNextHost = spawn("pnpm", ["exec", "next", "dev"], {
          cwd: nextHostRoot,
          stdio: "inherit",
          env: nextHostEnvironment,
        });
        currentNextHost.on("exit", (code) => {
          const normalizedCode = code ?? 0;
          if (stopRequested) {
            return;
          }
          if (normalizedCode === 0) {
            stopRequested = true;
            if (currentGateway?.exitCode === null) {
              currentGateway.kill("SIGTERM");
            }
            stopResolve?.();
            return;
          }
          stopRequested = true;
          stopReject?.(new Error(`next host exited with code ${normalizedCode}.`));
        });
        currentNextHost.on("error", (error) => {
          if (!stopRequested) {
            stopRequested = true;
            stopReject?.(error instanceof Error ? error : new Error(String(error)));
          }
        });
      }
      await watcher.start({
        roots: this.resolveDevWatchRoots({
          consumerRoot: paths.consumerRoot,
          devMode,
          repoRoot: paths.repoRoot,
        }),
        onChange: async () => {
          const restartStarted = performance.now();
          try {
            await this.notifyDevelopmentGateway({
              gatewayBaseUrl,
              developmentServerToken,
              payload: {
                kind: "buildStarted",
              },
            });
            await this.notifyDevelopmentGateway({
              gatewayBaseUrl,
              developmentServerToken,
              payload: {
                kind: "buildCompleted",
                buildVersion: `${Date.now()}-${process.pid}`,
              },
            });
            const totalMs = performance.now() - restartStarted;
            this.performanceDiagnosticsLogger.info(
              `triggered source-based runtime restart timingMs={total:${totalMs.toFixed(1)}}`,
            );
          } catch (error) {
            const exception = error instanceof Error ? error : new Error(String(error));
            await this.notifyDevelopmentGateway({
              gatewayBaseUrl,
              developmentServerToken,
              payload: {
                kind: "buildFailed",
                message: exception.message,
              },
            });
            this.cliLogger.error("source-based runtime restart request failed", exception);
          }
        },
      });
      if (devMode === "consumer") {
        this.cliLogger.info(
          `Codemation dev (consumer): open http://127.0.0.1:${gatewayPort} — requires a built @codemation/next-host (next build). For Next HMR use CODEMATION_DEV_MODE=framework.`,
        );
      }
      await stopPromise;
    } finally {
      await watcher.stop();
      await devLock.release();
    }
  }

  private async runServeWeb(consumerRoot: string): Promise<void> {
    const paths = await this.pathResolver.resolve(consumerRoot);
    this.configureTypeScriptRuntime(paths.repoRoot);
    const builder = new CodemationConsumerOutputBuilder(paths.consumerRoot);
    const snapshot = await builder.ensureBuilt();
    const discoveredPlugins = await this.pluginDiscovery.discover(paths.consumerRoot);
    const manifest = await this.publishBuildArtifacts(snapshot, discoveredPlugins);
    await builder.pruneRetiredRevisions(manifest.buildVersion);
    const nextHostRoot = path.dirname(this.require.resolve("@codemation/next-host/package.json"));
    const consumerEnv = CodemationConsumerEnvLoader.load(paths.consumerRoot);
    const nextPort = this.resolveNextPort(process.env.PORT);
    const websocketPort = this.resolveWebsocketPort({
      nextPort,
      publicWebsocketPort: process.env.NEXT_PUBLIC_CODEMATION_WS_PORT,
      websocketPort: process.env.CODEMATION_WS_PORT,
    });
    const child = spawn("pnpm", ["exec", "next", "start"], {
      cwd: nextHostRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        ...consumerEnv,
        PORT: String(nextPort),
        CODEMATION_CONSUMER_OUTPUT_MANIFEST_PATH: manifest.manifestPath,
        CODEMATION_CONSUMER_ROOT: paths.consumerRoot,
        CODEMATION_WS_PORT: String(websocketPort),
        NEXT_PUBLIC_CODEMATION_WS_PORT: String(websocketPort),
        NODE_OPTIONS: this.createNodeOptionsForSourceMaps(process.env.NODE_OPTIONS),
        WS_NO_BUFFER_UTIL: "1",
        WS_NO_UTF_8_VALIDATE: "1",
      },
    });
    await new Promise<void>((resolve, reject) => {
      child.on("exit", (code) => {
        if ((code ?? 0) === 0) {
          resolve();
          return;
        }
        reject(new Error(`next start exited with code ${code ?? 0}.`));
      });
      child.on("error", reject);
    });
  }

  private async runServeWorker(consumerRoot: string, configPathOverride?: string): Promise<void> {
    const workerPackageRoot = path.dirname(this.require.resolve("@codemation/worker-cli/package.json"));
    const workerBin = path.join(workerPackageRoot, "bin", "codemation-worker.js");
    const args = [workerBin];
    if (configPathOverride !== undefined && configPathOverride.trim().length > 0) {
      args.push("--config", path.resolve(process.cwd(), configPathOverride.trim()));
    }
    args.push("--consumer-root", consumerRoot);
    const child = spawn(process.execPath, args, {
      cwd: consumerRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        NODE_OPTIONS: this.createNodeOptionsForSourceMaps(process.env.NODE_OPTIONS),
      },
    });
    await new Promise<void>((resolve, reject) => {
      child.on("exit", (code) => {
        if ((code ?? 0) === 0) {
          resolve();
          return;
        }
        reject(new Error(`codemation-worker exited with code ${code ?? 0}.`));
      });
      child.on("error", reject);
    });
  }

  private parsePositiveInt(raw: string | undefined): number | null {
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
    return null;
  }

  private configureTypeScriptRuntime(repoRoot: string): void {
    process.env.CODEMATION_TSCONFIG_PATH = path.resolve(repoRoot, "tsconfig.base.json");
  }

  private createNextHostEnvironment(
    args: Readonly<{
      authConfigJson: string;
      consumerRoot: string;
      developmentServerToken: string;
      nextPort: number;
      skipUiAuth: boolean;
      websocketPort: number;
      runtimeDevUrl?: string;
    }>,
  ): NodeJS.ProcessEnv {
    const consumerEnv = CodemationConsumerEnvLoader.load(args.consumerRoot);
    return {
      ...process.env,
      ...consumerEnv,
      PORT: String(args.nextPort),
      CODEMATION_AUTH_CONFIG_JSON: args.authConfigJson,
      CODEMATION_CONSUMER_ROOT: args.consumerRoot,
      CODEMATION_SKIP_UI_AUTH: args.skipUiAuth ? "true" : "false",
      NEXT_PUBLIC_CODEMATION_SKIP_UI_AUTH: args.skipUiAuth ? "true" : "false",
      CODEMATION_WS_PORT: String(args.websocketPort),
      NEXT_PUBLIC_CODEMATION_WS_PORT: String(args.websocketPort),
      CODEMATION_DEV_SERVER_TOKEN: args.developmentServerToken,
      CODEMATION_SKIP_STARTUP_MIGRATIONS: "true",
      NODE_OPTIONS: this.createNodeOptionsForSourceMaps(process.env.NODE_OPTIONS),
      WS_NO_BUFFER_UTIL: "1",
      WS_NO_UTF_8_VALIDATE: "1",
      ...(args.runtimeDevUrl !== undefined && args.runtimeDevUrl.trim().length > 0
        ? { CODEMATION_RUNTIME_DEV_URL: args.runtimeDevUrl.trim() }
        : {}),
      // Consumer dotenv must not override secrets/DB URL when the parent (e.g. Playwright webServer) set them.
      DATABASE_URL: process.env.DATABASE_URL ?? consumerEnv.DATABASE_URL,
      AUTH_SECRET: process.env.AUTH_SECRET ?? consumerEnv.AUTH_SECRET,
    };
  }

  private resolveDevelopmentServerToken(rawToken: string | undefined): string {
    if (rawToken && rawToken.trim().length > 0) {
      return rawToken;
    }
    return randomUUID();
  }

  private async resolveDevAuthSettings(consumerRoot: string): Promise<
    Readonly<{
      authConfigJson: string;
      skipUiAuth: boolean;
    }>
  > {
    const resolution = await this.configLoader.load({ consumerRoot });
    return {
      authConfigJson: JSON.stringify(resolution.config.auth ?? null),
      skipUiAuth: resolution.config.auth?.allowUnauthenticatedInDevelopment === true,
    };
  }

  private resolveDevWatchRoots(
    args: Readonly<{
      consumerRoot: string;
      devMode: "consumer" | "framework";
      repoRoot: string;
    }>,
  ): ReadonlyArray<string> {
    if (args.devMode === "consumer") {
      return [args.consumerRoot];
    }
    return [
      args.consumerRoot,
      path.resolve(args.repoRoot, "packages", "core"),
      path.resolve(args.repoRoot, "packages", "core-nodes"),
      path.resolve(args.repoRoot, "packages", "core-nodes-gmail"),
      path.resolve(args.repoRoot, "packages", "eventbus-redis"),
      path.resolve(args.repoRoot, "packages", "host"),
      path.resolve(args.repoRoot, "packages", "node-example"),
      path.resolve(args.repoRoot, "packages", "queue-bullmq"),
      path.resolve(args.repoRoot, "packages", "run-store-sqlite"),
      path.resolve(args.repoRoot, "packages", "runtime-dev"),
    ];
  }

  private async resolveFreePortOnLoopback(): Promise<number> {
    return await new Promise<number>((resolve, reject) => {
      const server = createServer();
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => {
        const address = server.address();
        server.close(() => {
          if (address && typeof address === "object") {
            resolve(address.port);
            return;
          }
          reject(new Error("Failed to resolve a free TCP port."));
        });
      });
    });
  }

  private async resolveRuntimeToolEntrypoint(
    args: Readonly<{
      packageName: string;
      repoRoot: string;
      sourceEntrypoint: string;
    }>,
  ): Promise<
    Readonly<{
      args: ReadonlyArray<string>;
      command: string;
      env: Readonly<Record<string, string>>;
    }>
  > {
    const sourceEntrypointPath = path.resolve(args.repoRoot, args.sourceEntrypoint);
    if (await this.exists(sourceEntrypointPath)) {
      return {
        command: process.execPath,
        args: ["--import", "tsx", sourceEntrypointPath],
        env: {
          TSX_TSCONFIG_PATH: path.resolve(args.repoRoot, "tsconfig.codemation-tsx.json"),
        },
      };
    }
    return {
      command: process.execPath,
      args: [this.require.resolve(args.packageName)],
      env: {},
    };
  }

  private async waitForHttpOk(url: string): Promise<void> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        const response = await fetch(url);
        if (response.ok || response.status === 404) {
          return;
        }
      } catch {
        // not listening yet
      }
      await delay(50);
    }
    throw new Error(`Timed out waiting for HTTP response from ${url}`);
  }

  private async waitForGatewayReadiness(gatewayBaseUrl: string): Promise<void> {
    const normalizedBase = gatewayBaseUrl.replace(/\/$/, "");
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        const response = await fetch(`${normalizedBase}/api/dev/health`);
        if (response.ok) {
          return;
        }
      } catch {
        // Server not listening yet.
      }
      await delay(50);
    }
    throw new Error("Timed out waiting for dev gateway HTTP health check.");
  }

  private async notifyDevelopmentGateway(
    args: Readonly<{
      gatewayBaseUrl: string;
      developmentServerToken: string;
      payload: Readonly<{
        kind: "buildStarted" | "buildCompleted" | "buildFailed";
        buildVersion?: string;
        message?: string;
      }>;
    }>,
  ): Promise<void> {
    const targetUrl = `${args.gatewayBaseUrl.replace(/\/$/, "")}${ApiPaths.devGatewayNotify()}`;
    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-codemation-dev-token": args.developmentServerToken,
        },
        body: JSON.stringify(args.payload),
      });
      if (!response.ok) {
        this.cliLogger.warn(`failed to notify dev gateway status=${response.status}`);
      }
    } catch (error) {
      this.cliLogger.warn(`failed to notify dev gateway: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private resolveNextPort(rawPort: string | undefined): number {
    const parsedPort = Number(rawPort);
    if (Number.isInteger(parsedPort) && parsedPort > 0) {
      return parsedPort;
    }
    return 3000;
  }

  private resolveWebsocketPort(
    args: Readonly<{ nextPort: number; publicWebsocketPort: string | undefined; websocketPort: string | undefined }>,
  ): number {
    const explicitPort = this.parsePositivePort(args.publicWebsocketPort) ?? this.parsePositivePort(args.websocketPort);
    if (explicitPort !== null) {
      return explicitPort;
    }
    return args.nextPort + 1;
  }

  private parsePositivePort(rawPort: string | undefined): number | null {
    const parsedPort = Number(rawPort);
    if (Number.isInteger(parsedPort) && parsedPort > 0) {
      return parsedPort;
    }
    return null;
  }

  private createNodeOptionsForSourceMaps(existingNodeOptions: string | undefined): string {
    const sourceMapOption = "--enable-source-maps";
    if (!existingNodeOptions || existingNodeOptions.trim().length === 0) {
      return sourceMapOption;
    }
    if (existingNodeOptions.includes(sourceMapOption)) {
      return existingNodeOptions;
    }
    return `${existingNodeOptions} ${sourceMapOption}`.trim();
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async writeDiscoveredPluginsOutput(
    snapshot: CodemationConsumerOutputBuildSnapshot,
    discoveredPlugins: ReadonlyArray<CodemationDiscoveredPluginPackage>,
  ): Promise<string> {
    const outputPath = path.resolve(snapshot.revisionOutputRoot, "plugins.js");
    await mkdir(path.dirname(outputPath), { recursive: true });
    const outputLines: string[] = ["const codemationDiscoveredPlugins = [];", ""];
    discoveredPlugins.forEach((discoveredPlugin: CodemationDiscoveredPluginPackage, index: number) => {
      const pluginFileUrl = pathToFileURL(
        path.resolve(discoveredPlugin.packageRoot, discoveredPlugin.manifest.entry),
      ).href;
      const exportNameAccessor = discoveredPlugin.manifest.exportName
        ? `pluginModule${index}[${JSON.stringify(discoveredPlugin.manifest.exportName)}]`
        : `pluginModule${index}.default ?? pluginModule${index}.codemationPlugin`;
      outputLines.push(`const pluginModule${index} = await import(${JSON.stringify(pluginFileUrl)});`);
      outputLines.push(`const pluginValue${index} = ${exportNameAccessor};`);
      outputLines.push(`if (pluginValue${index} && typeof pluginValue${index}.register === "function") {`);
      outputLines.push(`  codemationDiscoveredPlugins.push(pluginValue${index});`);
      outputLines.push(
        `} else if (typeof pluginValue${index} === "function" && pluginValue${index}.prototype && typeof pluginValue${index}.prototype.register === "function") {`,
      );
      outputLines.push(`  codemationDiscoveredPlugins.push(new pluginValue${index}());`);
      outputLines.push("}");
      outputLines.push("");
    });
    outputLines.push("export { codemationDiscoveredPlugins };");
    outputLines.push("export default codemationDiscoveredPlugins;");
    outputLines.push("");
    await writeFile(outputPath, outputLines.join("\n"), "utf8");
    return outputPath;
  }

  private async publishBuildArtifacts(
    snapshot: CodemationConsumerOutputBuildSnapshot,
    discoveredPlugins: ReadonlyArray<CodemationDiscoveredPluginPackage>,
  ): Promise<CodemationConsumerBuildManifest> {
    const pluginEntryPath = await this.writeDiscoveredPluginsOutput(snapshot, discoveredPlugins);
    return await this.writeBuildManifest(snapshot, pluginEntryPath);
  }

  private async writeBuildManifest(
    snapshot: CodemationConsumerOutputBuildSnapshot,
    pluginEntryPath: string,
  ): Promise<CodemationConsumerBuildManifest> {
    const manifest: CodemationConsumerBuildManifest = {
      buildVersion: snapshot.buildVersion,
      consumerRoot: snapshot.consumerRoot,
      entryPath: snapshot.outputEntryPath,
      manifestPath: snapshot.manifestPath,
      pluginEntryPath,
      workflowSourcePaths: snapshot.workflowSourcePaths,
    };
    await mkdir(path.dirname(snapshot.manifestPath), { recursive: true });
    const temporaryManifestPath = `${snapshot.manifestPath}.${snapshot.buildVersion}.${randomUUID()}.tmp`;
    await writeFile(temporaryManifestPath, JSON.stringify(manifest, null, 2), "utf8");
    await rename(temporaryManifestPath, snapshot.manifestPath);
    return manifest;
  }
}
