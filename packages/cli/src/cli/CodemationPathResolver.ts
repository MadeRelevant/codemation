import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { CodemationApplicationRootResolver } from "./CodemationApplicationRootResolver";
import { CodemationCliOptionReader } from "./CodemationCliOptionReader";
import { CodemationConsumerProjectResolver } from "./CodemationConsumerProjectResolver";
import { CodemationPathExistence } from "./CodemationPathExistence";
import { CodemationWorkspaceRootDetector } from "./CodemationWorkspaceRootDetector";
import type { CodemationResolvedPaths } from "./types";

export class CodemationPathResolver {
  constructor(
    private readonly workspaceRootDetector: CodemationWorkspaceRootDetector = new CodemationWorkspaceRootDetector(new CodemationPathExistence()),
    private readonly applicationRootResolver: CodemationApplicationRootResolver = new CodemationApplicationRootResolver(),
    private readonly consumerProjectResolver: CodemationConsumerProjectResolver = new CodemationConsumerProjectResolver(),
  ) {}

  async resolve(options: CodemationCliOptionReader): Promise<CodemationResolvedPaths> {
    const consumerStartPath = path.resolve(options.getString("consumer-root") ?? process.cwd());
    const consumerProject = await this.consumerProjectResolver.resolve(consumerStartPath);
    const explicitWorkspaceRoot = options.getString("workspace-root", "repo-root");
    const workspaceRoot = explicitWorkspaceRoot ? path.resolve(explicitWorkspaceRoot) : await this.workspaceRootDetector.detect(consumerProject.root);
    const applicationRoot = await this.applicationRootResolver.resolve(workspaceRoot);
    const cliEntrypointPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "bin", "codemation.ts");
    return {
      consumerRoot: consumerProject.root,
      consumerPackageJsonPath: consumerProject.packageJsonPath,
      consumerPackageName: consumerProject.packageName,
      workspaceRoot,
      repoRoot: workspaceRoot ?? consumerProject.root,
      applicationRoot,
      cliEntrypointPath,
    };
  }
}
