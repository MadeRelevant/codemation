import { spawn } from "node:child_process";
import process from "node:process";
import { CodemationManagedProcess } from "./CodemationManagedProcess";
import { CodemationNextBinaryResolver } from "./CodemationNextBinaryResolver";
import type { CodemationResolvedPaths, CodemationResolvedPorts, CodemationSharedEnvironment } from "./types";

export class CodemationChildProcessFactory {
  constructor(private readonly nextBinaryResolver: CodemationNextBinaryResolver = new CodemationNextBinaryResolver()) {}

  async createWatchedNextDevProcess(
    paths: CodemationResolvedPaths,
    ports: CodemationResolvedPorts,
    env: CodemationSharedEnvironment,
    watchPaths: ReadonlyArray<string>,
  ): Promise<CodemationManagedProcess> {
    return new CodemationManagedProcess(
      spawn(process.execPath, this.createWatchedNextArgs(paths, ports, watchPaths), {
        cwd: paths.applicationRoot,
        stdio: "inherit",
        env: env.nextEnv,
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

  async createHostProcess(paths: CodemationResolvedPaths, ports: CodemationResolvedPorts, env: CodemationSharedEnvironment): Promise<CodemationManagedProcess> {
    return new CodemationManagedProcess(
      spawn(process.execPath, [this.nextBinaryResolver.resolve(paths.applicationRoot), "dev", "--hostname", "127.0.0.1", "--port", String(ports.frontendPort)], {
        cwd: paths.applicationRoot,
        stdio: "inherit",
        env: env.nextEnv,
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

  private createWatchedNextArgs(
    paths: CodemationResolvedPaths,
    ports: CodemationResolvedPorts,
    watchPaths: ReadonlyArray<string>,
  ): ReadonlyArray<string> {
    return [
      "--watch",
      ...watchPaths.map((watchPath) => `--watch-path=${watchPath}`),
      this.nextBinaryResolver.resolve(paths.applicationRoot),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(ports.frontendPort),
    ];
  }
}
