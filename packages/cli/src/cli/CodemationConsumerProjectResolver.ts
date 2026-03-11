import path from "node:path";
import { CodemationPackageJsonReader, type CodemationPackageJson } from "./CodemationPackageJsonReader";
import { CodemationPathExistence } from "./CodemationPathExistence";

export interface CodemationResolvedConsumerProject {
  readonly root: string;
  readonly packageJsonPath: string | null;
  readonly packageName: string;
}

export class CodemationConsumerProjectResolver {
  constructor(
    private readonly pathExistence: CodemationPathExistence = new CodemationPathExistence(),
    private readonly packageJsonReader: CodemationPackageJsonReader = new CodemationPackageJsonReader(),
  ) {}

  async resolve(startPath: string): Promise<CodemationResolvedConsumerProject> {
    const resolvedStartPath = path.resolve(startPath);
    const discoveredPackageJsonPath = await this.findNearestPackageJson(resolvedStartPath);
    if (discoveredPackageJsonPath) {
      const projectRoot = path.dirname(discoveredPackageJsonPath);
      const packageJson = await this.packageJsonReader.read(discoveredPackageJsonPath);
      if (await this.looksLikeConsumerProject(projectRoot, packageJson)) {
        return this.createResolvedProject(projectRoot, discoveredPackageJsonPath, packageJson);
      }
    }
    return this.createResolvedProject(resolvedStartPath, null, null);
  }

  private async findNearestPackageJson(startPath: string): Promise<string | null> {
    let currentDirectory = startPath;
    while (true) {
      const candidate = path.resolve(currentDirectory, "package.json");
      if (await this.pathExistence.exists(candidate)) return candidate;
      const parentDirectory = path.dirname(currentDirectory);
      if (parentDirectory === currentDirectory) return null;
      currentDirectory = parentDirectory;
    }
  }

  private async looksLikeConsumerProject(projectRoot: string, packageJson: CodemationPackageJson): Promise<boolean> {
    if (this.hasCodemationDependency(packageJson)) return true;
    if (await this.pathExistence.exists(path.resolve(projectRoot, "codemation.config.ts"))) return true;
    if (await this.pathExistence.exists(path.resolve(projectRoot, "codemation.config.js"))) return true;
    if (await this.pathExistence.exists(path.resolve(projectRoot, "src", "workflows"))) return true;
    if (await this.pathExistence.exists(path.resolve(projectRoot, "workflows"))) return true;
    return false;
  }

  private hasCodemationDependency(packageJson: CodemationPackageJson): boolean {
    return this.hasDependency(packageJson.dependencies) || this.hasDependency(packageJson.devDependencies);
  }

  private hasDependency(dependencies: Readonly<Record<string, string>> | undefined): boolean {
    if (!dependencies) return false;
    return "@codemation/frontend" in dependencies || "@codemation/core" in dependencies || "@codemation/cli" in dependencies;
  }

  private createResolvedProject(
    projectRoot: string,
    packageJsonPath: string | null,
    packageJson: CodemationPackageJson | null,
  ): CodemationResolvedConsumerProject {
    return {
      root: projectRoot,
      packageJsonPath,
      packageName: packageJson?.name ?? path.basename(projectRoot),
    };
  }
}
