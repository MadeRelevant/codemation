import { Command } from "commander";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir,rename,writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { fileURLToPath,pathToFileURL } from "node:url";
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
    console.log(`Built consumer output: ${snapshot.outputEntryPath}`);
    console.log(`Discovered plugins: ${discoveredPlugins.length}`);
    console.log(`Published revision: ${manifest.buildVersion}`);
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
      await builder.ensureWatching({
        onBuildStarted: async () => {
          await this.notifyNextHostDevelopmentRuntime({
            nextPort,
            developmentServerToken,
            payload: {
              kind: "buildStarted",
            },
          });
        },
        onBuildCompleted: async (nextSnapshot) => {
          const nextDiscoveredPlugins = await this.pluginDiscovery.discover(paths.consumerRoot);
          const nextManifest = await this.publishBuildArtifacts(nextSnapshot, nextDiscoveredPlugins);
          await builder.pruneRetiredRevisions(nextManifest.buildVersion);
          await this.notifyNextHostDevelopmentRuntime({
            nextPort,
            developmentServerToken,
            payload: {
              kind: "buildCompleted",
              buildVersion: nextManifest.buildVersion,
            },
          });
          console.log(`[codemation] rebuilt consumer output revision=${nextManifest.buildVersion}`);
        },
        onBuildFailed: async (error: Error) => {
          await this.notifyNextHostDevelopmentRuntime({
            nextPort,
            developmentServerToken,
            payload: {
              kind: "buildFailed",
              message: error.message,
            },
          });
        },
      });
      const nextHostPackageJsonPath = this.require.resolve("@codemation/next-host/package.json");
      const nextHostRoot = path.dirname(nextHostPackageJsonPath);
      const nextHostEnvironment = this.createNextHostEnvironment({
        consumerOutputManifestPath: snapshot.manifestPath,
        consumerRoot: paths.consumerRoot,
        developmentServerToken,
        nextPort,
        websocketPort,
      });
      const childProcess = spawn("pnpm", ["exec", "next", "dev"], {
        cwd: nextHostRoot,
        stdio: "inherit",
        env: nextHostEnvironment,
      });
      this.bindSignals(childProcess);
      await new Promise<void>((resolve, reject) => {
        childProcess.on("exit", (code) => {
          if ((code ?? 0) === 0) {
            resolve();
            return;
          }
          reject(new Error(`Next host exited with code ${code ?? 0}.`));
        });
        childProcess.on("error", reject);
      });
    } finally {
      await devLock.release();
    }
  }

  private bindSignals(childProcess: ReturnType<typeof spawn>): void {
    for (const signal of ["SIGINT", "SIGTERM", "SIGQUIT"] as const) {
      process.on(signal, () => {
        if (childProcess.exitCode === null) {
          childProcess.kill(signal);
        }
      });
    }
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
    };
  }

  private resolveDevelopmentServerToken(rawToken: string | undefined): string {
    if (rawToken && rawToken.trim().length > 0) {
      return rawToken;
    }
    return randomUUID();
  }

  private async notifyNextHostDevelopmentRuntime(args: Readonly<{
    nextPort: number;
    developmentServerToken: string;
    payload: Readonly<Record<string, string>>;
  }>): Promise<void> {
    try {
      const response = await fetch(`http://127.0.0.1:${args.nextPort}${CodemationCli.developmentRuntimeRoutePath}`, {
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
      console.warn(`[codemation-cli] failed to notify next host about dev runtime event status=${response.status}`);
    } catch {
      // Ignore cases where Next has not started yet or is currently reloading.
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
