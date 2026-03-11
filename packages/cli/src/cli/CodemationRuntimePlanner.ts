import process from "node:process";
import { CodemationApplication, CodemationBootstrapDiscovery } from "@codemation/frontend";
import type { CodemationPlannedRuntime, CodemationResolvedPaths } from "./types";

export class CodemationRuntimePlanner {
  constructor(
    private readonly bootstrapDiscovery: CodemationBootstrapDiscovery = new CodemationBootstrapDiscovery(),
    private readonly applicationType: typeof CodemationApplication = CodemationApplication,
  ) {}

  async plan(paths: CodemationResolvedPaths): Promise<CodemationPlannedRuntime> {
    const application = new this.applicationType();
    await this.bootstrapDiscovery.discover({
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
