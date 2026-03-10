import process from "node:process";
import { CodemationChildProcessFactory } from "./CodemationChildProcessFactory";
import { CodemationEnvironmentFactory } from "./CodemationEnvironmentFactory";
import { CodemationManagedProcess } from "./CodemationManagedProcess";
import { CodemationPortPlanner } from "./CodemationPortPlanner";
import { CodemationRuntimePlanner } from "./CodemationRuntimePlanner";
import { CodemationSignalHandler } from "./CodemationSignalHandler";
import { CodemationWatchPathPlanner } from "./CodemationWatchPathPlanner";
import type { CodemationResolvedPaths } from "./types";

export class CodemationDevSupervisor {
  private readonly processes: CodemationManagedProcess[] = [];
  private stopping = false;

  constructor(
    private readonly runtimePlanner: CodemationRuntimePlanner = new CodemationRuntimePlanner(),
    private readonly portPlanner: CodemationPortPlanner = new CodemationPortPlanner(),
    private readonly environmentFactory: CodemationEnvironmentFactory = new CodemationEnvironmentFactory(),
    private readonly watchPathPlanner: CodemationWatchPathPlanner = new CodemationWatchPathPlanner(),
    private readonly childProcessFactory: CodemationChildProcessFactory = new CodemationChildProcessFactory(),
    private readonly signalHandler: CodemationSignalHandler = new CodemationSignalHandler(),
  ) {}

  async start(paths: CodemationResolvedPaths): Promise<void> {
    const runtime = await this.runtimePlanner.plan(paths);
    const ports = await this.portPlanner.plan(runtime);
    const env = this.environmentFactory.create(paths, ports, runtime);
    const watchPaths = await this.watchPathPlanner.plan(paths);

    const nextProcess = await this.childProcessFactory.createHostProcess(paths, ports, env);
    this.processes.push(nextProcess);

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
