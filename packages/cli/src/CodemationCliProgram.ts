import { Command } from "commander";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir,rename,writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath,pathToFileURL } from "node:url";
import { logLevelPolicyFactory, ServerLoggerFactory } from "@codemation/host/next/server";
import { CodemationCliPathResolver } from "./CodemationCliPathResolver";
import { CodemationConsumerEnvLoader } from "./CodemationConsumerEnvLoader";
import {
CodemationConsumerOutputBuilder,
type CodemationConsumerOutputBuildSnapshot,
} from "./CodemationConsumerOutputBuilder";
import { CodemationDevLock } from "./CodemationDevLock";
import { CodemationLocalUserCreator } from "./CodemationLocalUserCreator";
import { CodemationPluginDiscovery,type CodemationDiscoveredPluginPackage } from "./CodemationPluginDiscovery";

type CodemationConsumerBuildManifest = Readonly<{
  buildVersion: string;
  consumerRoot: string;
  entryPath: string;
  pluginEntryPath: string;
  workflowSourcePaths: ReadonlyArray<string>;
}>;

export class CodemationCli {
  private readonly require = createRequire(import.meta.url);
  private static readonly developmentRuntimeRoutePath = "/api/dev/runtime";
  private readonly loggerFactory = new ServerLoggerFactory(logLevelPolicyFactory);
  private readonly cliLogger = this.loggerFactory.create("codemation-cli");
  private readonly performanceDiagnosticsLogger = this.loggerFactory.createPerformanceDiagnostics("codemation-cli.performance");

  constructor(
    private readonly pathResolver: CodemationCliPathResolver = new CodemationCliPathResolver(),
    private readonly pluginDiscovery: CodemationPluginDiscovery = new CodemationPluginDiscovery(),
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
      .description("Start the Next.js dev server with file watching and live rebuilds.")
      .option("--consumer-root <path>", "Path to the consumer project root (defaults to cwd)")
      .action(async (opts: Readonly<{ consumerRoot?: string }>) => {
        await this.runDev(resolveConsumerRoot(opts.consumerRoot));
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
    const devLock = new CodemationDevLock();
    const nextPort = this.resolveNextPort(process.env.PORT);
    await devLock.acquire({
      consumerRoot: paths.consumerRoot,
      nextPort,
    });
    const builder = new CodemationConsumerOutputBuilder(paths.consumerRoot);
    try {
      const snapshot = await builder.ensureBuilt();
      const discoveredPlugins = await this.pluginDiscovery.discover(paths.consumerRoot);
      const manifest = await this.publishBuildArtifacts(snapshot, discoveredPlugins);
      await builder.pruneRetiredRevisions(manifest.buildVersion);
      const websocketPort = this.resolveWebsocketPort({
        nextPort,
        publicWebsocketPort: process.env.NEXT_PUBLIC_CODEMATION_WS_PORT,
        websocketPort: process.env.CODEMATION_WS_PORT,
      });
      const developmentServerToken = this.resolveDevelopmentServerToken(process.env.CODEMATION_DEV_SERVER_TOKEN);
      const useRuntimeWorker = process.env.CODEMATION_DEV_DISABLE_RUNTIME_WORKER !== "true";
      const nextRestartAfterBuilds =
        this.parsePositiveInt(process.env.CODEMATION_DEV_NEXT_RESTART_AFTER_BUILDS)
        ?? (useRuntimeWorker ? 100_000 : 75);
      const nextMaxAutomaticRestarts = this.parsePositiveInt(process.env.CODEMATION_DEV_NEXT_MAX_RESTARTS) ?? 10;
      let buildsSinceNextStart = 0;
      let currentNextHost: ReturnType<typeof spawn> | null = null;
      let currentRuntimeWorker: ReturnType<typeof spawn> | null = null;
      let stopRequested = false;
      let restartRequested = false;
      let automaticRestartCount = 0;
      let stopResolve: (() => void) | null = null;
      let stopReject: ((error: Error) => void) | null = null;

      const stopPromise = new Promise<void>((resolve, reject) => {
        stopResolve = resolve;
        stopReject = reject;
      });

      const requestNextHostRestart = (): void => {
        if (useRuntimeWorker) {
          return;
        }
        if (stopRequested || restartRequested) {
          return;
        }
        if (!currentNextHost || currentNextHost.exitCode !== null) {
          return;
        }
        this.cliLogger.warn(`restarting next host after ${buildsSinceNextStart} rebuilds to avoid dev-server memory growth`);
        restartRequested = true;
        currentNextHost.kill("SIGINT");
      };

      const runtimeHttpPort = useRuntimeWorker ? await this.resolveFreePortOnLoopback() : 0;
      const runtimeDevBaseUrl = useRuntimeWorker ? `http://127.0.0.1:${runtimeHttpPort}` : "";

      const nextHostPackageJsonPath = this.require.resolve("@codemation/next-host/package.json");
      const nextHostRoot = path.dirname(nextHostPackageJsonPath);
      const nextHostEnvironment = this.createNextHostEnvironment({
        consumerOutputManifestPath: snapshot.manifestPath,
        consumerRoot: paths.consumerRoot,
        developmentServerToken,
        nextPort,
        websocketPort,
        runtimeDevUrl: useRuntimeWorker ? runtimeDevBaseUrl : undefined,
      });

      const spawnNextHost = (): void => {
        buildsSinceNextStart = 0;
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
          if (restartRequested) {
            restartRequested = false;
            automaticRestartCount = 0;
            spawnNextHost();
            return;
          }
          if (normalizedCode === 0) {
            stopRequested = true;
            if (currentRuntimeWorker?.exitCode === null) {
              currentRuntimeWorker.kill("SIGTERM");
            }
            stopResolve?.();
            return;
          }
          automaticRestartCount += 1;
          if (automaticRestartCount > nextMaxAutomaticRestarts) {
            stopRequested = true;
            stopReject?.(new Error(`Next host exited with code ${normalizedCode} too many times. Restart limit=${nextMaxAutomaticRestarts}.`));
            return;
          }
          this.cliLogger.warn(`next host exited with code ${normalizedCode}; restarting (${automaticRestartCount}/${nextMaxAutomaticRestarts})`);
          spawnNextHost();
        });
        currentNextHost.on("error", (error) => {
          if (stopRequested) {
            return;
          }
          this.cliLogger.warn(`next host process error; restarting: ${error instanceof Error ? error.message : String(error)}`);
          spawnNextHost();
        });
      };

      for (const signal of ["SIGINT", "SIGTERM", "SIGQUIT"] as const) {
        process.on(signal, () => {
          stopRequested = true;
          if (currentRuntimeWorker?.exitCode === null) {
            currentRuntimeWorker.kill(signal);
          }
          if (currentNextHost?.exitCode === null) {
            currentNextHost.kill(signal);
          }
          stopResolve?.();
        });
      }

      if (useRuntimeWorker) {
        const consumerEnv = CodemationConsumerEnvLoader.load(paths.consumerRoot);
        const runtimePackageRoot = path.dirname(this.require.resolve("@codemation/runtime-dev/package.json"));
        const runtimeBinJs = path.join(runtimePackageRoot, "dist", "bin.js");
        const runtimeWorkingDirectory = paths.repoRoot ?? paths.consumerRoot;
        currentRuntimeWorker = spawn(process.execPath, [runtimeBinJs], {
          cwd: runtimeWorkingDirectory,
          stdio: "inherit",
          env: {
            ...process.env,
            ...consumerEnv,
            CODEMATION_CONSUMER_OUTPUT_MANIFEST_PATH: snapshot.manifestPath,
            CODEMATION_CONSUMER_ROOT: paths.consumerRoot,
            CODEMATION_RUNTIME_HTTP_PORT: String(runtimeHttpPort),
            CODEMATION_WS_PORT: String(websocketPort),
            CODEMATION_DEV_SERVER_TOKEN: developmentServerToken,
            NODE_OPTIONS: this.createNodeOptionsForSourceMaps(process.env.NODE_OPTIONS),
            WS_NO_BUFFER_UTIL: "1",
            WS_NO_UTF_8_VALIDATE: "1",
          },
        });
        currentRuntimeWorker.on("error", (error) => {
          if (!stopRequested) {
            stopRequested = true;
            stopReject?.(error instanceof Error ? error : new Error(String(error)));
          }
        });
        currentRuntimeWorker.on("exit", (code) => {
          if (stopRequested) {
            return;
          }
          stopRequested = true;
          stopReject?.(new Error(`runtime-dev exited unexpectedly with code ${code ?? 0}.`));
        });
        await this.waitForRuntimeWorkerReadiness(runtimeDevBaseUrl);
      }

      await builder.ensureWatching({
        onBuildStarted: async () => {
          await this.notifyDevelopmentRuntime({
            useRuntimeWorker,
            nextPort,
            runtimeDevBaseUrl,
            developmentServerToken,
            payload: {
              kind: "buildStarted",
            },
          });
        },
        onBuildCompleted: async (nextSnapshot) => {
          const buildCompletedStarted = performance.now();
          const discoveredStarted = performance.now();
          const nextDiscoveredPlugins = await this.pluginDiscovery.discover(paths.consumerRoot);
          const discoveredMs = performance.now() - discoveredStarted;
          const publishStarted = performance.now();
          const nextManifest = await this.publishBuildArtifacts(nextSnapshot, nextDiscoveredPlugins);
          const publishMs = performance.now() - publishStarted;
          const pruneStarted = performance.now();
          await builder.pruneRetiredRevisions(nextManifest.buildVersion);
          const pruneMs = performance.now() - pruneStarted;
          const notifyStarted = performance.now();
          await this.notifyDevelopmentRuntime({
            useRuntimeWorker,
            nextPort,
            runtimeDevBaseUrl,
            developmentServerToken,
            payload: {
              kind: "buildCompleted",
              buildVersion: nextManifest.buildVersion,
            },
          });
          const notifyMs = performance.now() - notifyStarted;
          const totalMs = performance.now() - buildCompletedStarted;
          this.performanceDiagnosticsLogger.info(
            `rebuilt consumer output revision=${nextManifest.buildVersion} timingMs={discover:${discoveredMs.toFixed(1)} publish:${publishMs.toFixed(1)} prune:${pruneMs.toFixed(1)} notifyRuntime:${notifyMs.toFixed(1)} total:${totalMs.toFixed(1)}}`,
          );
          buildsSinceNextStart += 1;
          if (buildsSinceNextStart >= nextRestartAfterBuilds) {
            requestNextHostRestart();
          }
        },
        onBuildFailed: async (error: Error) => {
          await this.notifyDevelopmentRuntime({
            useRuntimeWorker,
            nextPort,
            runtimeDevBaseUrl,
            developmentServerToken,
            payload: {
              kind: "buildFailed",
              message: error.message,
            },
          });
        },
      });
      spawnNextHost();
      await stopPromise;
    } finally {
      await devLock.release();
    }
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

  private createNextHostEnvironment(args: Readonly<{
    consumerOutputManifestPath: string;
    consumerRoot: string;
    developmentServerToken: string;
    nextPort: number;
    websocketPort: number;
    runtimeDevUrl?: string;
  }>): NodeJS.ProcessEnv {
    const consumerEnv = CodemationConsumerEnvLoader.load(args.consumerRoot);
    return {
      ...process.env,
      ...consumerEnv,
      PORT: String(args.nextPort),
      CODEMATION_CONSUMER_OUTPUT_MANIFEST_PATH: args.consumerOutputManifestPath,
      CODEMATION_CONSUMER_ROOT: args.consumerRoot,
      CODEMATION_WS_PORT: String(args.websocketPort),
      NEXT_PUBLIC_CODEMATION_WS_PORT: String(args.websocketPort),
      CODEMATION_DEV_SERVER_TOKEN: args.developmentServerToken,
      NODE_OPTIONS: this.createNodeOptionsForSourceMaps(process.env.NODE_OPTIONS),
      WS_NO_BUFFER_UTIL: "1",
      WS_NO_UTF_8_VALIDATE: "1",
      ...(args.runtimeDevUrl !== undefined && args.runtimeDevUrl.trim().length > 0
        ? { CODEMATION_RUNTIME_DEV_URL: args.runtimeDevUrl.trim() }
        : {}),
    };
  }

  private resolveDevelopmentServerToken(rawToken: string | undefined): string {
    if (rawToken && rawToken.trim().length > 0) {
      return rawToken;
    }
    return randomUUID();
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

  private async waitForRuntimeWorkerReadiness(runtimeDevBaseUrl: string): Promise<void> {
    const normalizedBase = runtimeDevBaseUrl.replace(/\/$/, "");
    for (let attempt = 0; attempt < 200; attempt += 1) {
      try {
        const response = await fetch(`${normalizedBase}/dev/health`);
        if (response.ok) {
          return;
        }
      } catch {
        // Server not listening yet.
      }
      await delay(50);
    }
    throw new Error("Timed out waiting for runtime-dev HTTP health check.");
  }

  private async notifyDevelopmentRuntime(args: Readonly<{
    useRuntimeWorker: boolean;
    nextPort: number;
    runtimeDevBaseUrl: string;
    developmentServerToken: string;
    payload: Readonly<{
      kind: "buildStarted" | "buildCompleted" | "buildFailed";
      buildVersion?: string;
      message?: string;
    }>;
  }>): Promise<void> {
    const targetUrl = args.useRuntimeWorker
      ? `${args.runtimeDevBaseUrl.replace(/\/$/, "")}/dev/runtime`
      : `http://127.0.0.1:${args.nextPort}${CodemationCli.developmentRuntimeRoutePath}`;
    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-codemation-dev-token": args.developmentServerToken,
        },
        body: JSON.stringify(args.payload),
      });
      if (response.ok || response.status === 404 || response.status === 503) {
        return;
      }
      this.cliLogger.warn(`failed to notify dev runtime status=${response.status}`);
    } catch {
      // Ignore cases where the target has not started yet or is currently reloading.
    }
  }

  private resolveNextPort(rawPort: string | undefined): number {
    const parsedPort = Number(rawPort);
    if (Number.isInteger(parsedPort) && parsedPort > 0) {
      return parsedPort;
    }
    return 3000;
  }

  private resolveWebsocketPort(args: Readonly<{ nextPort: number; publicWebsocketPort: string | undefined; websocketPort: string | undefined }>): number {
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

  private async writeDiscoveredPluginsOutput(
    snapshot: CodemationConsumerOutputBuildSnapshot,
    discoveredPlugins: ReadonlyArray<CodemationDiscoveredPluginPackage>,
  ): Promise<string> {
    const outputPath = path.resolve(snapshot.revisionOutputRoot, "plugins.js");
    await mkdir(path.dirname(outputPath), { recursive: true });
    const outputLines: string[] = [
      "const codemationDiscoveredPlugins = [];",
      "",
    ];
    discoveredPlugins.forEach((discoveredPlugin: CodemationDiscoveredPluginPackage, index: number) => {
      const pluginFileUrl = pathToFileURL(path.resolve(discoveredPlugin.packageRoot, discoveredPlugin.manifest.entry)).href;
      const exportNameAccessor = discoveredPlugin.manifest.exportName
        ? `pluginModule${index}[${JSON.stringify(discoveredPlugin.manifest.exportName)}]`
        : `pluginModule${index}.default ?? pluginModule${index}.codemationPlugin`;
      outputLines.push(`const pluginModule${index} = await import(${JSON.stringify(pluginFileUrl)});`);
      outputLines.push(`const pluginValue${index} = ${exportNameAccessor};`);
      outputLines.push(`if (pluginValue${index} && typeof pluginValue${index}.register === "function") {`);
      outputLines.push(`  codemationDiscoveredPlugins.push(pluginValue${index});`);
      outputLines.push(`} else if (typeof pluginValue${index} === "function" && pluginValue${index}.prototype && typeof pluginValue${index}.prototype.register === "function") {`);
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
