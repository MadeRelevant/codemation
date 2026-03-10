import { readdir } from "node:fs/promises";
import path from "node:path";
import { CodemationPathExistence } from "./CodemationPathExistence";
import type { CodemationResolvedPaths } from "./types";

export class CodemationWatchPathPlanner {
  constructor(private readonly pathExistence: CodemationPathExistence = new CodemationPathExistence()) {}

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
