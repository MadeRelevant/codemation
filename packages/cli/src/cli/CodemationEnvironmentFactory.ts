import process from "node:process";
import type { CodemationPlannedRuntime, CodemationResolvedPaths, CodemationResolvedPorts, CodemationSharedEnvironment } from "./types";

export class CodemationEnvironmentFactory {
  create(
    paths: CodemationResolvedPaths,
    ports: CodemationResolvedPorts,
    runtime: CodemationPlannedRuntime,
  ): CodemationSharedEnvironment {
    const baseEnv: NodeJS.ProcessEnv = {
      ...process.env,
      CODEMATION_FRONTEND_PORT: String(ports.frontendPort),
      CODEMATION_WS_PORT: String(ports.websocketPort),
      NEXT_PUBLIC_CODEMATION_WS_PORT: String(ports.websocketPort),
      VITE_CODEMATION_WS_PORT: String(ports.websocketPort),
      CODEMATION_REALTIME_MODE: runtime.mode,
      CODEMATION_CONSUMER_ROOT: paths.consumerRoot,
      CODEMATION_CONSUMER_PACKAGE_NAME: paths.consumerPackageName,
      CODEMATION_REPO_ROOT: paths.repoRoot,
    };
    if (paths.consumerPackageJsonPath) {
      baseEnv.CODEMATION_CONSUMER_PACKAGE_JSON = paths.consumerPackageJsonPath;
    }

    return {
      baseEnv,
      workerEnv: { ...baseEnv },
      nextEnv: {
        ...baseEnv,
        PORT: String(ports.frontendPort),
      },
    };
  }
}
