import process from "node:process";
import { CodemationApplication } from "@codemation/application";
import { CodemationChildProcessFactory } from "./CodemationChildProcessFactory";
import { CodemationEnvironmentFactory } from "./CodemationEnvironmentFactory";
import { CodemationPortPlanner } from "./CodemationPortPlanner";
import { CodemationRuntimePlanner } from "./CodemationRuntimePlanner";
import { CodemationSignalHandler } from "./CodemationSignalHandler";
import type { CodemationResolvedPaths } from "./types";

export class CodemationServiceRunner {
  private stopping = false;

  constructor(
    private readonly signalHandler: CodemationSignalHandler = new CodemationSignalHandler(),
    private readonly applicationType: typeof CodemationApplication = CodemationApplication,
    private readonly runtimePlanner: CodemationRuntimePlanner = new CodemationRuntimePlanner(),
    private readonly portPlanner: CodemationPortPlanner = new CodemationPortPlanner(),
    private readonly environmentFactory: CodemationEnvironmentFactory = new CodemationEnvironmentFactory(),
    private readonly childProcessFactory: CodemationChildProcessFactory = new CodemationChildProcessFactory(),
  ) {}

  async runHost(paths: CodemationResolvedPaths): Promise<void> {
    const runtime = await this.runtimePlanner.plan(paths);
    const ports = await this.portPlanner.plan(runtime);
    const env = this.environmentFactory.create(paths, ports, runtime);
    const processHandle = await this.childProcessFactory.createHostProcess(paths, ports, env);
    processHandle.onExit(async (exitCode) => {
      await this.stop(async () => {
        await processHandle.stop();
      }, exitCode);
    });
    this.signalHandler.bind(async () => {
      await this.stop(async () => {
        await processHandle.stop();
      }, 0);
    });
  }

  async runWorker(paths: CodemationResolvedPaths): Promise<void> {
    const handle = await this.applicationType.startDiscoveredWorkerMode({
      repoRoot: paths.repoRoot,
      consumerRoot: paths.consumerRoot,
      env: this.createStringEnvironment(),
    });
    this.signalHandler.bind(async () => {
      await this.stop(handle.stop, 0);
    });
  }

  private createStringEnvironment(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === "string") result[key] = value;
    }
    return result;
  }

  private async stop(stopHandle: () => Promise<void>, exitCode: number): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    try {
      await stopHandle();
    } finally {
      process.exit(exitCode);
    }
  }
}
