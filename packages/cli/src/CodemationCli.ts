import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { CodemationCliPathResolver } from "./CodemationCliPathResolver";
import { CodemationConsumerOutputBuilder } from "./CodemationConsumerOutputBuilder";
import { CodemationPluginDiscovery, type CodemationDiscoveredPluginPackage } from "./CodemationPluginDiscovery";

export class CodemationCli {
  private readonly require = createRequire(import.meta.url);

  constructor(
    private readonly pathResolver: CodemationCliPathResolver = new CodemationCliPathResolver(),
    private readonly pluginDiscovery: CodemationPluginDiscovery = new CodemationPluginDiscovery(),
  ) {}

  async run(args: ReadonlyArray<string>): Promise<void> {
    const command = args[0] ?? "dev";
    if (command === "build") {
      await this.runBuild(args.slice(1));
      return;
    }
    if (command === "dev") {
      await this.runDev(args.slice(1));
      return;
    }
    throw new Error(`Unknown codemation command: ${command}`);
  }

  private async runBuild(args: ReadonlyArray<string>): Promise<void> {
    const consumerRoot = this.parseConsumerRoot(args) ?? process.cwd();
    const paths = await this.pathResolver.resolve(consumerRoot);
    this.configureTypeScriptRuntime(paths.repoRoot);
    const builder = new CodemationConsumerOutputBuilder(paths.consumerRoot);
    const snapshot = await builder.ensureBuilt();
    const discoveredPlugins = await this.pluginDiscovery.discover(paths.consumerRoot);
    await this.writeDiscoveredPluginsOutput(paths.consumerRoot, discoveredPlugins);
    console.log(`Built consumer output: ${snapshot.outputEntryPath}`);
    console.log(`Discovered plugins: ${discoveredPlugins.length}`);
  }

  private async runDev(args: ReadonlyArray<string>): Promise<void> {
    const consumerRoot = this.parseConsumerRoot(args) ?? process.cwd();
    const paths = await this.pathResolver.resolve(consumerRoot);
    this.configureTypeScriptRuntime(paths.repoRoot);
    const builder = new CodemationConsumerOutputBuilder(paths.consumerRoot);
    const snapshot = await builder.ensureBuilt();
    const discoveredPlugins = await this.pluginDiscovery.discover(paths.consumerRoot);
    const discoveredPluginsOutputPath = await this.writeDiscoveredPluginsOutput(paths.consumerRoot, discoveredPlugins);
    await builder.ensureWatching({
      onBuildCompleted: async () => {
        await this.writeDiscoveredPluginsOutput(paths.consumerRoot, await this.pluginDiscovery.discover(paths.consumerRoot));
        console.log("[codemation] rebuilt consumer output");
      },
    });
    const nextHostPackageJsonPath = this.require.resolve("@codemation/next-host/package.json");
    const nextHostRoot = path.dirname(nextHostPackageJsonPath);
    const nextHostEnvironment = this.createNextHostEnvironment({
      consumerOutputPath: snapshot.outputEntryPath,
      consumerRoot: paths.consumerRoot,
      discoveredPluginsOutputPath,
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
  }

  private parseConsumerRoot(args: ReadonlyArray<string>): string | undefined {
    const consumerRootIndex = args.indexOf("--consumer-root");
    if (consumerRootIndex >= 0 && consumerRootIndex + 1 < args.length) {
      return path.resolve(process.cwd(), args[consumerRootIndex + 1]!);
    }
    return undefined;
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
    consumerOutputPath: string;
    consumerRoot: string;
    discoveredPluginsOutputPath: string;
  }>): NodeJS.ProcessEnv {
    const nextPort = this.resolveNextPort(process.env.PORT);
    const websocketPort = this.resolveWebsocketPort({
      nextPort,
      publicWebsocketPort: process.env.NEXT_PUBLIC_CODEMATION_WS_PORT,
      websocketPort: process.env.CODEMATION_WS_PORT,
    });
    return {
      ...process.env,
      PORT: String(nextPort),
      CODEMATION_CONSUMER_OUTPUT_PATH: args.consumerOutputPath,
      CODEMATION_DISCOVERED_PLUGINS_OUTPUT_PATH: args.discoveredPluginsOutputPath,
      CODEMATION_CONSUMER_ROOT: args.consumerRoot,
      CODEMATION_WS_PORT: String(websocketPort),
      NEXT_PUBLIC_CODEMATION_WS_PORT: String(websocketPort),
      NODE_OPTIONS: this.createNodeOptionsForSourceMaps(process.env.NODE_OPTIONS),
      WS_NO_BUFFER_UTIL: "1",
      WS_NO_UTF_8_VALIDATE: "1",
    };
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
    consumerRoot: string,
    discoveredPlugins: ReadonlyArray<CodemationDiscoveredPluginPackage>,
  ): Promise<string> {
    const outputRoot = path.resolve(consumerRoot, ".codemation", "output");
    const outputPath = path.resolve(outputRoot, "plugins.js");
    await mkdir(outputRoot, { recursive: true });
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
}
