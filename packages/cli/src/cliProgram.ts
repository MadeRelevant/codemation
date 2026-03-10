import { spawn, type ChildProcess } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CodemationApplication, CodemationBootstrapDiscovery } from "@codemation/application";

type CodemationCliCommandName = "dev" | "host" | "worker" | "help";

type CodemationCliParsedCommand = Readonly<{
  name: CodemationCliCommandName;
  options: ReadonlyMap<string, string | true>;
}>;

type CodemationResolvedPaths = Readonly<{
  consumerRoot: string;
  workspaceRoot: string | null;
  repoRoot: string;
  applicationRoot: string;
  cliEntrypointPath: string;
}>;

type CodemationResolvedPorts = Readonly<{
  frontendPort: number;
  serverPort: number;
}>;

type CodemationPlannedRuntime = Readonly<{
  mode: "memory" | "redis";
  shouldStartWorker: boolean;
}>;

type CodemationSharedEnvironment = Readonly<{
  baseEnv: NodeJS.ProcessEnv;
  nextEnv: NodeJS.ProcessEnv;
  hostEnv: NodeJS.ProcessEnv;
  workerEnv: NodeJS.ProcessEnv;
}>;

class CodemationCliError extends Error {}

class CodemationCliArgumentParser {
  parse(argv: ReadonlyArray<string>): CodemationCliParsedCommand {
    const [rawCommand, ...rest] = argv;
    const name = this.parseCommandName(rawCommand);
    return {
      name,
      options: this.parseOptions(rest),
    };
  }

  getHelpText(): string {
    return [
      "Usage: codemation <command> [options]",
      "",
      "Commands:",
      "  dev      Start the framework UI plus discovered host runtime",
      "  host     Start only the discovered host runtime",
      "  worker   Start only the discovered worker runtime",
      "",
      "Options:",
      "  --consumer-root <path>   Consumer app root (defaults to current directory)",
      "  --workspace-root <path>  Workspace root for in-repo framework development",
      "  --repo-root <path>       Alias for --workspace-root",
      "  --help                   Show this help text",
    ].join("\n");
  }

  private parseCommandName(rawCommand: string | undefined): CodemationCliCommandName {
    if (!rawCommand || rawCommand === "--help" || rawCommand === "-h") return "help";
    if (rawCommand === "dev" || rawCommand === "host" || rawCommand === "worker") return rawCommand;
    throw new CodemationCliError(`Unknown codemation command: ${rawCommand}`);
  }

  private parseOptions(argv: ReadonlyArray<string>): ReadonlyMap<string, string | true> {
    const options = new Map<string, string | true>();
    for (let index = 0; index < argv.length; index++) {
      const entry = argv[index];
      if (!entry?.startsWith("--")) continue;
      const option = entry.slice(2);
      const [name, inlineValue] = option.split("=", 2);
      if (!name) continue;
      if (inlineValue !== undefined) {
        options.set(name, inlineValue);
        continue;
      }
      const nextEntry = argv[index + 1];
      if (!nextEntry || nextEntry.startsWith("--")) {
        options.set(name, true);
        continue;
      }
      options.set(name, nextEntry);
      index += 1;
    }
    return options;
  }
}

class CodemationCliOptionReader {
  constructor(private readonly options: ReadonlyMap<string, string | true>) {}

  getString(...names: ReadonlyArray<string>): string | undefined {
    for (const name of names) {
      const value = this.options.get(name);
      if (typeof value === "string" && value.length > 0) return value;
    }
    return undefined;
  }

  has(name: string): boolean {
    return this.options.has(name);
  }
}

class CodemationPathExistence {
  async exists(targetPath: string): Promise<boolean> {
    try {
      await access(targetPath);
      return true;
    } catch {
      return false;
    }
  }
}

class CodemationWorkspaceRootDetector {
  private readonly pathExistence = new CodemationPathExistence();

  async detect(startDirectory: string): Promise<string | null> {
    let currentDirectory = path.resolve(startDirectory);
    while (true) {
      if (await this.pathExistence.exists(path.resolve(currentDirectory, "pnpm-workspace.yaml"))) return currentDirectory;
      const parentDirectory = path.dirname(currentDirectory);
      if (parentDirectory === currentDirectory) return null;
      currentDirectory = parentDirectory;
    }
  }
}

class CodemationApplicationRootResolver {
  private readonly pathExistence = new CodemationPathExistence();
  private readonly moduleRequire = createRequire(import.meta.url);

  async resolve(workspaceRoot: string | null): Promise<string> {
    if (workspaceRoot) {
      const workspaceApplicationRoot = path.resolve(workspaceRoot, "packages", "application");
      if (await this.pathExistence.exists(path.resolve(workspaceApplicationRoot, "package.json"))) return workspaceApplicationRoot;
    }

    const siblingApplicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "application");
    if (await this.pathExistence.exists(path.resolve(siblingApplicationRoot, "package.json"))) return siblingApplicationRoot;

    const resolvedEntry = this.moduleRequire.resolve("@codemation/application");
    return path.resolve(resolvedEntry, "..", "..");
  }
}

class CodemationPathResolver {
  private readonly workspaceRootDetector = new CodemationWorkspaceRootDetector();
  private readonly applicationRootResolver = new CodemationApplicationRootResolver();

  async resolve(options: CodemationCliOptionReader): Promise<CodemationResolvedPaths> {
    const consumerRoot = path.resolve(options.getString("consumer-root") ?? process.cwd());
    const explicitWorkspaceRoot = options.getString("workspace-root", "repo-root");
    const workspaceRoot = explicitWorkspaceRoot ? path.resolve(explicitWorkspaceRoot) : await this.workspaceRootDetector.detect(consumerRoot);
    const applicationRoot = await this.applicationRootResolver.resolve(workspaceRoot);
    const cliEntrypointPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "bin", "codemation.ts");
    return {
      consumerRoot,
      workspaceRoot,
      repoRoot: workspaceRoot ?? consumerRoot,
      applicationRoot,
      cliEntrypointPath,
    };
  }
}

class CodemationRuntimePlanner {
  async plan(paths: CodemationResolvedPaths): Promise<CodemationPlannedRuntime> {
    const application = new CodemationApplication();
    await new CodemationBootstrapDiscovery().discover({
      application,
      consumerRoot: paths.consumerRoot,
      repoRoot: paths.repoRoot,
      env: process.env,
    });
    const mode = application.resolveRealtimeModeForEnvironment(process.env);
    return {
      mode,
      shouldStartWorker: mode === "redis",
    };
  }
}

class CodemationPortPlanner {
  async plan(runtime: CodemationPlannedRuntime): Promise<CodemationResolvedPorts> {
    const preferredFrontendPort = this.parsePort(process.env.CODEMATION_FRONTEND_PORT, 3000);
    const frontendPort = await this.pickAvailablePort(preferredFrontendPort);
    const preferredServerPort = this.parsePort(process.env.CODEMATION_SERVER_PORT ?? process.env.CODEMATION_WS_PORT, frontendPort + 1);
    const serverPort = runtime.mode === "redis" || frontendPort === preferredServerPort ? await this.pickAvailablePort(preferredServerPort) : await this.pickAvailablePort(preferredServerPort);
    return { frontendPort, serverPort };
  }

  private parsePort(rawPort: string | undefined, fallback: number): number {
    const parsed = Number(rawPort);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
    return fallback;
  }

  private async pickAvailablePort(preferredPort: number): Promise<number> {
    const startPort = Number.isInteger(preferredPort) && preferredPort > 0 ? preferredPort : 3000;
    for (let port = startPort; port < startPort + 50; port++) {
      // eslint-disable-next-line no-await-in-loop
      if (await this.isPortFree(port)) return port;
    }
    throw new CodemationCliError(`No available port found in range ${startPort}-${startPort + 49}`);
  }

  private async isPortFree(port: number): Promise<boolean> {
    return await new Promise<boolean>((resolve) => {
      const server = net
        .createServer()
        .once("error", () => resolve(false))
        .once("listening", () => server.close(() => resolve(true)))
        .listen({ port, host: "127.0.0.1" });
      server.unref();
    });
  }
}

class CodemationEnvironmentFactory {
  create(paths: CodemationResolvedPaths, ports: CodemationResolvedPorts, runtime: CodemationPlannedRuntime): CodemationSharedEnvironment {
    const serverUrl = `http://127.0.0.1:${ports.serverPort}`;
    const websocketUrl = `ws://127.0.0.1:${ports.serverPort}/api/workflows/ws`;
    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      CODEMATION_FRONTEND_PORT: String(ports.frontendPort),
      CODEMATION_SERVER_PORT: String(ports.serverPort),
      CODEMATION_WS_PORT: String(ports.serverPort),
      CODEMATION_SERVER_URL: serverUrl,
      NEXT_PUBLIC_CODEMATION_SERVER_URL: serverUrl,
      NEXT_PUBLIC_CODEMATION_WS_PORT: String(ports.serverPort),
      NEXT_PUBLIC_CODEMATION_WS_URL: websocketUrl,
      CODEMATION_REALTIME_MODE: runtime.mode,
      CODEMATION_CONSUMER_ROOT: paths.consumerRoot,
      CODEMATION_REPO_ROOT: paths.repoRoot,
    };

    return {
      baseEnv,
      hostEnv: { ...baseEnv },
      workerEnv: { ...baseEnv },
      nextEnv: {
        ...baseEnv,
        PORT: String(ports.frontendPort),
      },
    };
  }
}

class CodemationWatchPathPlanner {
  private readonly pathExistence = new CodemationPathExistence();

  async plan(paths: CodemationResolvedPaths): Promise<ReadonlyArray<string>> {
    const watchedPaths: string[] = [];
    await this.addIfExists(watchedPaths, path.resolve(paths.consumerRoot, "src"));
    await this.addIfExists(watchedPaths, path.resolve(paths.consumerRoot, "workflows"));
    await this.addIfExists(watchedPaths, path.resolve(paths.consumerRoot, "codemation.config.ts"));
    await this.addIfExists(watchedPaths, path.resolve(paths.consumerRoot, "codemation.config.js"));
    await this.addIfExists(watchedPaths, path.resolve(paths.consumerRoot, "src", "codemation.config.ts"));
    await this.addIfExists(watchedPaths, path.resolve(paths.consumerRoot, "src", "codemation.config.js"));

    if (paths.workspaceRoot) {
      const packagesRoot = path.resolve(paths.workspaceRoot, "packages");
      if (await this.pathExistence.exists(packagesRoot)) {
        const entries = await readdir(packagesRoot, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          // eslint-disable-next-line no-await-in-loop
          await this.addIfExists(watchedPaths, path.resolve(packagesRoot, entry.name, "src"));
        }
      }
    }

    return watchedPaths;
  }

  private async addIfExists(target: string[], candidatePath: string): Promise<void> {
    if (await this.pathExistence.exists(candidatePath)) target.push(candidatePath);
  }
}

class CodemationManagedProcess {
  constructor(private readonly childProcess: ChildProcess) {}

  onExit(onExit: (exitCode: number) => Promise<void>): void {
    this.childProcess.on("exit", (code) => {
      void onExit(code ?? 0);
    });
  }

  async stop(): Promise<void> {
    if (!this.childProcess.pid) return;
    if (this.childProcess.exitCode !== null) return;
    this.childProcess.kill("SIGTERM");
    await new Promise<void>((resolve) => {
      const forceKillTimer = setTimeout(() => {
        if (this.childProcess.exitCode === null) this.childProcess.kill("SIGKILL");
      }, 5000);
      this.childProcess.once("exit", () => {
        clearTimeout(forceKillTimer);
        resolve();
      });
    });
  }
}

class CodemationNextBinaryResolver {
  resolve(applicationRoot: string): string {
    const packageRequire = createRequire(path.resolve(applicationRoot, "package.json"));
    return packageRequire.resolve("next/dist/bin/next");
  }
}

class CodemationChildProcessFactory {
  private readonly nextBinaryResolver = new CodemationNextBinaryResolver();

  async createNextDevProcess(paths: CodemationResolvedPaths, ports: CodemationResolvedPorts, env: CodemationSharedEnvironment): Promise<CodemationManagedProcess> {
    return new CodemationManagedProcess(
      spawn(process.execPath, [this.nextBinaryResolver.resolve(paths.applicationRoot), "dev", "--hostname", "127.0.0.1", "--port", String(ports.frontendPort)], {
        cwd: paths.applicationRoot,
        stdio: "inherit",
        env: env.nextEnv,
      }),
    );
  }

  async createWatchedHostProcess(
    paths: CodemationResolvedPaths,
    env: CodemationSharedEnvironment,
    watchPaths: ReadonlyArray<string>,
  ): Promise<CodemationManagedProcess> {
    return new CodemationManagedProcess(
      spawn(process.execPath, this.createWatchArgs(paths, watchPaths, "host"), {
        cwd: paths.consumerRoot,
        stdio: "inherit",
        env: env.hostEnv,
      }),
    );
  }

  async createWatchedWorkerProcess(
    paths: CodemationResolvedPaths,
    env: CodemationSharedEnvironment,
    watchPaths: ReadonlyArray<string>,
  ): Promise<CodemationManagedProcess> {
    return new CodemationManagedProcess(
      spawn(process.execPath, this.createWatchArgs(paths, watchPaths, "worker"), {
        cwd: paths.consumerRoot,
        stdio: "inherit",
        env: env.workerEnv,
      }),
    );
  }

  private createWatchArgs(
    paths: CodemationResolvedPaths,
    watchPaths: ReadonlyArray<string>,
    commandName: "host" | "worker",
  ): ReadonlyArray<string> {
    return [
      "--watch",
      ...watchPaths.map((watchPath) => `--watch-path=${watchPath}`),
      "--import",
      "tsx",
      paths.cliEntrypointPath,
      commandName,
      `--consumer-root=${paths.consumerRoot}`,
      `--repo-root=${paths.repoRoot}`,
    ];
  }
}

class CodemationSignalHandler {
  bind(stop: () => Promise<void>): void {
    process.on("SIGINT", () => {
      void stop();
    });
    process.on("SIGTERM", () => {
      void stop();
    });
    process.on("SIGQUIT", () => {
      void stop();
    });
  }
}

class CodemationDevSupervisor {
  private readonly runtimePlanner = new CodemationRuntimePlanner();
  private readonly portPlanner = new CodemationPortPlanner();
  private readonly environmentFactory = new CodemationEnvironmentFactory();
  private readonly watchPathPlanner = new CodemationWatchPathPlanner();
  private readonly childProcessFactory = new CodemationChildProcessFactory();
  private readonly processes: CodemationManagedProcess[] = [];
  private readonly signalHandler = new CodemationSignalHandler();
  private stopping = false;

  async start(paths: CodemationResolvedPaths): Promise<void> {
    const runtime = await this.runtimePlanner.plan(paths);
    const ports = await this.portPlanner.plan(runtime);
    const env = this.environmentFactory.create(paths, ports, runtime);
    const watchPaths = await this.watchPathPlanner.plan(paths);

    const nextProcess = await this.childProcessFactory.createNextDevProcess(paths, ports, env);
    const hostProcess = await this.childProcessFactory.createWatchedHostProcess(paths, env, watchPaths);
    this.processes.push(nextProcess, hostProcess);

    if (runtime.shouldStartWorker) {
      const workerProcess = await this.childProcessFactory.createWatchedWorkerProcess(paths, env, watchPaths);
      this.processes.push(workerProcess);
      workerProcess.onExit(async (exitCode) => {
        await this.stop(exitCode);
      });
    }

    nextProcess.onExit(async (exitCode) => {
      await this.stop(exitCode);
    });
    hostProcess.onExit(async (exitCode) => {
      await this.stop(exitCode);
    });

    this.signalHandler.bind(async () => {
      await this.stop(0);
    });
  }

  private async stop(exitCode: number): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    for (const managedProcess of [...this.processes].reverse()) {
      await managedProcess.stop();
    }
    process.exit(exitCode);
  }
}

class CodemationServiceRunner {
  private readonly signalHandler = new CodemationSignalHandler();
  private stopping = false;

  async runHost(paths: CodemationResolvedPaths): Promise<void> {
    const handle = await CodemationApplication.startDiscoveredFrontendHostMode({
      repoRoot: paths.repoRoot,
      consumerRoot: paths.consumerRoot,
      env: this.createStringEnvironment(),
    });
    this.signalHandler.bind(async () => {
      await this.stop(handle.stop);
    });
  }

  async runWorker(paths: CodemationResolvedPaths): Promise<void> {
    const handle = await CodemationApplication.startDiscoveredWorkerMode({
      repoRoot: paths.repoRoot,
      consumerRoot: paths.consumerRoot,
      env: this.createStringEnvironment(),
    });
    this.signalHandler.bind(async () => {
      await this.stop(handle.stop);
    });
  }

  private createStringEnvironment(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") result[key] = value;
    }
    return result;
  }

  private async stop(stopHandle: () => Promise<void>): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    try {
      await stopHandle();
    } finally {
      process.exit(0);
    }
  }
}

export class CodemationCliProgram {
  private readonly argumentParser = new CodemationCliArgumentParser();
  private readonly pathResolver = new CodemationPathResolver();
  private readonly devSupervisor = new CodemationDevSupervisor();
  private readonly serviceRunner = new CodemationServiceRunner();

  async run(argv: ReadonlyArray<string>): Promise<void> {
    const parsedCommand = this.argumentParser.parse(argv);
    if (parsedCommand.name === "help" || new CodemationCliOptionReader(parsedCommand.options).has("help")) {
      console.log(this.argumentParser.getHelpText());
      return;
    }

    const options = new CodemationCliOptionReader(parsedCommand.options);
    const paths = await this.pathResolver.resolve(options);

    if (parsedCommand.name === "dev") {
      await this.devSupervisor.start(paths);
      return;
    }
    if (parsedCommand.name === "host") {
      await this.serviceRunner.runHost(paths);
      return;
    }
    await this.serviceRunner.runWorker(paths);
  }
}
