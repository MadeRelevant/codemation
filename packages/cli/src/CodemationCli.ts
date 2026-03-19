import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { CodemationCliPathResolver } from "./CodemationCliPathResolver";
import {
  CodemationConsumerOutputBuilder,
  type CodemationConsumerOutputBuildSnapshot,
} from "./CodemationConsumerOutputBuilder";
import { CodemationPluginDiscovery, type CodemationDiscoveredPluginPackage } from "./CodemationPluginDiscovery";

type CodemationConsumerBuildManifest = Readonly<{
  buildVersion: string;
  consumerRoot: string;
  entryPath: string;
  pluginEntryPath: string;
  workflowSourcePaths: ReadonlyArray<string>;
}>;

type CodemationDevLockRecord = Readonly<{
  pid: number;
  startedAt: string;
  consumerRoot: string;
  nextPort: number;
}>;

class CodemationDevLock {
  private lockPath: string | null = null;

  async acquire(args: Readonly<{ consumerRoot: string; nextPort: number }>): Promise<void> {
    const lockPath = this.resolveLockPath(args.consumerRoot);
    await mkdir(path.dirname(lockPath), { recursive: true });
    const record: CodemationDevLockRecord = {
      pid: process.pid,
      startedAt: new Date().toISOString(),
      consumerRoot: args.consumerRoot,
      nextPort: args.nextPort,
    };
    try {
      await this.writeExclusive(lockPath, JSON.stringify(record, null, 2));
      this.lockPath = lockPath;
      return;
    } catch (error) {
      const errorWithCode = error as Error & Readonly<{ code?: unknown }>;
      if (errorWithCode.code !== "EEXIST") {
        throw error;
      }
    }

    const existingRecord = await this.readExistingRecord(lockPath);
    if (existingRecord && this.isProcessAlive(existingRecord.pid)) {
      throw new Error(
        `codemation dev is already running for ${args.consumerRoot} (pid=${existingRecord.pid}, port=${existingRecord.nextPort}). Stop it before starting a new dev server.`,
      );
    }

    await rm(lockPath, { force: true }).catch(() => null);
    await this.writeExclusive(lockPath, JSON.stringify(record, null, 2));
    this.lockPath = lockPath;
  }

  async release(): Promise<void> {
    if (!this.lockPath) {
      return;
    }
    const lockPath = this.lockPath;
    this.lockPath = null;
    await rm(lockPath, { force: true }).catch(() => null);
  }

  private resolveLockPath(consumerRoot: string): string {
    return path.resolve(consumerRoot, ".codemation", "dev.lock");
  }

  private async writeExclusive(filePath: string, contents: string): Promise<void> {
    const handle = await open(filePath, "wx");
    try {
      await handle.writeFile(contents, "utf8");
    } finally {
      await handle.close().catch(() => null);
    }
  }

  private async readExistingRecord(lockPath: string): Promise<CodemationDevLockRecord | null> {
    try {
      const raw = await readFile(lockPath, "utf8");
      const parsed = JSON.parse(raw) as Partial<CodemationDevLockRecord>;
      if (
        typeof parsed.pid !== "number" ||
        typeof parsed.startedAt !== "string" ||
        typeof parsed.consumerRoot !== "string" ||
        typeof parsed.nextPort !== "number"
      ) {
        return null;
      }
      return parsed as CodemationDevLockRecord;
    } catch {
      return null;
    }
  }

  private isProcessAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) {
      return false;
    }
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}

export class CodemationCli {
  private readonly require = createRequire(import.meta.url);
  private static readonly developmentRuntimeRoutePath = "/api/dev/runtime";

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
    const manifest = await this.publishBuildArtifacts(snapshot, discoveredPlugins);
    console.log(`Built consumer output: ${snapshot.outputEntryPath}`);
    console.log(`Discovered plugins: ${discoveredPlugins.length}`);
    console.log(`Published revision: ${manifest.buildVersion}`);
  }

  private async runDev(args: ReadonlyArray<string>): Promise<void> {
    const consumerRoot = this.parseConsumerRoot(args) ?? process.cwd();
    const paths = await this.pathResolver.resolve(consumerRoot);
    this.configureTypeScriptRuntime(paths.repoRoot);
    const builder = new CodemationConsumerOutputBuilder(paths.consumerRoot);
    const snapshot = await builder.ensureBuilt();
    const discoveredPlugins = await this.pluginDiscovery.discover(paths.consumerRoot);
    const manifest = await this.publishBuildArtifacts(snapshot, discoveredPlugins);
    const nextPort = this.resolveNextPort(process.env.PORT);
    const websocketPort = this.resolveWebsocketPort({
      nextPort,
      publicWebsocketPort: process.env.NEXT_PUBLIC_CODEMATION_WS_PORT,
      websocketPort: process.env.CODEMATION_WS_PORT,
    });
    const developmentServerToken = this.resolveDevelopmentServerToken(process.env.CODEMATION_DEV_SERVER_TOKEN);
    const devLock = new CodemationDevLock();
    await devLock.acquire({
      consumerRoot: paths.consumerRoot,
      nextPort,
    });
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
    try {
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
    consumerOutputManifestPath: string;
    consumerRoot: string;
    developmentServerToken: string;
    nextPort: number;
    websocketPort: number;
  }>): NodeJS.ProcessEnv {
    return {
      ...process.env,
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
