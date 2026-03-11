import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CodemationPathExistence } from "./CodemationPathExistence";

export class CodemationApplicationRootResolver {
  private readonly moduleRequire = createRequire(import.meta.url);

  constructor(private readonly pathExistence: CodemationPathExistence = new CodemationPathExistence()) {}

  async resolve(workspaceRoot: string | null): Promise<string> {
    if (workspaceRoot) {
      const workspaceApplicationRoot = path.resolve(workspaceRoot, "packages", "frontend");
      if (await this.pathExistence.exists(path.resolve(workspaceApplicationRoot, "package.json"))) return workspaceApplicationRoot;
    }

    const siblingApplicationRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "frontend");
    if (await this.pathExistence.exists(path.resolve(siblingApplicationRoot, "package.json"))) return siblingApplicationRoot;

    const resolvedEntry = this.moduleRequire.resolve("@codemation/frontend");
    return path.resolve(resolvedEntry, "..", "..");
  }
}
