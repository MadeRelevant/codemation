import { spawn } from "node:child_process";
import process from "node:process";
import { CodemationManagedProcess } from "./CodemationManagedProcess";
import { CodemationViteBinaryResolver } from "./CodemationViteBinaryResolver";
import type { CodemationResolvedPaths, CodemationResolvedPorts, CodemationSharedEnvironment } from "./types";

export class CodemationChildProcessFactory {
  constructor(private readonly viteBinaryResolver: CodemationViteBinaryResolver = new CodemationViteBinaryResolver()) {}

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

  async createHostProcess(paths: CodemationResolvedPaths, ports: CodemationResolvedPorts, env: CodemationSharedEnvironment): Promise<CodemationManagedProcess> {
    return new CodemationManagedProcess(
      spawn(process.execPath, [this.viteBinaryResolver.resolve(paths.consumerRoot), "dev", "--host", "127.0.0.1", "--port", String(ports.frontendPort)], {
        cwd: paths.consumerRoot,
        stdio: "inherit",
        env: env.hostEnv,
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
