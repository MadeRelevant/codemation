import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { CodemationManagedProcess } from "./CodemationManagedProcess";
import { CodemationNextBinaryResolver } from "./CodemationNextBinaryResolver";
import { CodemationViteBinaryResolver } from "./CodemationViteBinaryResolver";
import type { CodemationResolvedPaths, CodemationResolvedPorts, CodemationSharedEnvironment } from "./types";

export class CodemationChildProcessFactory {
  constructor(
    private readonly nextBinaryResolver: CodemationNextBinaryResolver = new CodemationNextBinaryResolver(),
    private readonly viteBinaryResolver: CodemationViteBinaryResolver = new CodemationViteBinaryResolver(),
  ) {}

  async createWatchedNextDevProcess(
    paths: CodemationResolvedPaths,
    ports: CodemationResolvedPorts,
    env: CodemationSharedEnvironment,
    watchPaths: ReadonlyArray<string>,
  ): Promise<CodemationManagedProcess> {
    return new CodemationManagedProcess(
      spawn(process.execPath, this.createWatchedNextArgs(paths, ports, watchPaths), {
        cwd: paths.consumerRoot,
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
    if (this.shouldUseViteHost(paths.consumerRoot)) {
      return new CodemationManagedProcess(
        spawn(process.execPath, [this.viteBinaryResolver.resolve(paths.consumerRoot), "dev", "--host", "127.0.0.1", "--port", String(ports.frontendPort)], {
          cwd: paths.consumerRoot,
          stdio: "inherit",
          env: env.nextEnv,
        }),
      );
    }
    return new CodemationManagedProcess(
      spawn(process.execPath, [this.nextBinaryResolver.resolve(paths.consumerRoot), "dev", "--hostname", "127.0.0.1", "--port", String(ports.frontendPort)], {
        cwd: paths.consumerRoot,
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
      this.nextBinaryResolver.resolve(paths.consumerRoot),
      "dev",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(ports.frontendPort),
    ];
  }

  private shouldUseViteHost(consumerRoot: string): boolean {
    return existsSync(path.resolve(consumerRoot, "vite.config.ts")) || existsSync(path.resolve(consumerRoot, "vite.config.mts"));
  }
}
