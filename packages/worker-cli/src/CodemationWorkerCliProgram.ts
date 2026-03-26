import { CodemationApplication } from "@codemation/host";
import path from "node:path";
import process from "node:process";
import { CodemationWorkerConfigLoader } from "./CodemationWorkerConfigLoader";
import { CodemationWorkerPathResolver } from "./CodemationWorkerPathResolver";

export class CodemationWorkerCli {
  constructor(
    private readonly pathResolver: CodemationWorkerPathResolver = new CodemationWorkerPathResolver(),
    private readonly configLoader: CodemationWorkerConfigLoader = new CodemationWorkerConfigLoader(),
  ) {}

  async run(args: ReadonlyArray<string>): Promise<void> {
    const consumerRoot = this.parseConsumerRoot(args) ?? process.cwd();
    const paths = await this.pathResolver.resolve(consumerRoot);
    const configPath = this.parseConfigPath(args);
    const configResolution = await this.configLoader.load({
      consumerRoot: paths.consumerRoot,
      configPathOverride: configPath,
    });
    const effectiveEnv = this.createStringEnvironment();
    const application = new CodemationApplication();
    application.useConfig(configResolution.config);
    await application.applyPlugins({
      consumerRoot: paths.consumerRoot,
      repoRoot: paths.repoRoot,
      env: effectiveEnv,
      workflowSources: configResolution.workflowSources,
    });
    await application.applyBootHook({
      bootHookToken: configResolution.config.bootHook,
      consumerRoot: paths.consumerRoot,
      repoRoot: paths.repoRoot,
      env: effectiveEnv,
      workflowSources: configResolution.workflowSources,
    });

    process.env.CODEMATION_CONSUMER_ROOT = paths.consumerRoot;
    process.env.CODEMATION_REPO_ROOT = paths.repoRoot;

    const workerQueues =
      configResolution.config.runtime?.scheduler?.workerQueues ??
      this.parseQueues(effectiveEnv.WORKER_QUEUES ?? "default");
    const handle = await application.startWorkerRuntime({
      repoRoot: paths.repoRoot,
      consumerRoot: paths.consumerRoot,
      env: effectiveEnv,
      queues: workerQueues,
      bootstrapSource: configResolution.bootstrapSource,
      workflowSources: configResolution.workflowSources,
    });

    this.bindSignals(handle.stop);
  }

  private parseConsumerRoot(args: ReadonlyArray<string>): string | undefined {
    const configIndex = args.indexOf("--config");
    if (configIndex >= 0 && configIndex + 1 < args.length) {
      const configPath = args[configIndex + 1];
      if (configPath && !configPath.startsWith("-")) {
        return path.resolve(process.cwd(), path.dirname(configPath));
      }
    }
    const consumerRootIndex = args.indexOf("--consumer-root");
    if (consumerRootIndex >= 0 && consumerRootIndex + 1 < args.length) {
      return path.resolve(process.cwd(), args[consumerRootIndex + 1]!);
    }
    return undefined;
  }

  private createStringEnvironment(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") result[key] = value;
    }
    return result;
  }

  private parseConfigPath(args: ReadonlyArray<string>): string | undefined {
    const configIndex = args.indexOf("--config");
    if (configIndex >= 0 && configIndex + 1 < args.length) {
      const configPath = args[configIndex + 1];
      if (configPath && !configPath.startsWith("-")) {
        return path.resolve(process.cwd(), configPath);
      }
    }
    return undefined;
  }

  private parseQueues(rawQueues: string): ReadonlyArray<string> {
    return rawQueues
      .split(",")
      .map((queue) => queue.trim())
      .filter(Boolean);
  }

  private bindSignals(stop: () => Promise<void>): void {
    let stopping = false;
    const onSignal = async (): Promise<void> => {
      if (stopping) return;
      stopping = true;
      try {
        await stop();
      } finally {
        process.exit(0);
      }
    };
    process.on("SIGINT", () => void onSignal());
    process.on("SIGTERM", () => void onSignal());
    process.on("SIGQUIT", () => void onSignal());
  }
}
