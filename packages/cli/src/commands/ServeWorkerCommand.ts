import { AppContainerFactory, WorkerRuntime } from "@codemation/host";
import { AppConfigLoader } from "@codemation/host/server";
import process from "node:process";
import { CliPathResolver } from "../path/CliPathResolver";

export class ServeWorkerCommand {
  constructor(
    private readonly pathResolver: CliPathResolver,
    private readonly appConfigLoader: AppConfigLoader,
    private readonly appContainerFactory: AppContainerFactory,
  ) {}

  async execute(consumerRoot: string, configPathOverride?: string): Promise<void> {
    const paths = await this.pathResolver.resolve(consumerRoot);
    const loadResult = await this.appConfigLoader.load({
      consumerRoot,
      repoRoot: paths.repoRoot,
      env: process.env,
      configPathOverride,
    });
    if (loadResult.appConfig.scheduler.kind !== "bullmq") {
      throw new Error('Worker mode requires runtime.scheduler.kind = "bullmq".');
    }
    const container = await this.appContainerFactory.create({
      appConfig: loadResult.appConfig,
      sharedWorkflowWebsocketServer: null,
    });
    const workerQueues =
      loadResult.appConfig.scheduler.workerQueues.length > 0
        ? loadResult.appConfig.scheduler.workerQueues
        : ["default"];
    const handle = await container.resolve(WorkerRuntime).start(workerQueues);
    await new Promise<void>((resolve) => {
      this.bindSignals(handle.stop, resolve);
    });
  }

  private bindSignals(stop: () => Promise<void>, resolve: () => void): void {
    let stopping = false;
    const onSignal = async (): Promise<void> => {
      if (stopping) {
        return;
      }
      stopping = true;
      try {
        await stop();
      } finally {
        resolve();
        process.exit(0);
      }
    };
    process.on("SIGINT", () => void onSignal());
    process.on("SIGTERM", () => void onSignal());
    process.on("SIGQUIT", () => void onSignal());
  }
}
