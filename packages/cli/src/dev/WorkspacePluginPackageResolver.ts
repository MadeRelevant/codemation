import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

type PackageJsonShape = Readonly<{
  name?: string;
  codemation?: Readonly<{
    plugin?: string;
  }>;
  dependencies?: Readonly<Record<string, string>>;
  devDependencies?: Readonly<Record<string, string>>;
  optionalDependencies?: Readonly<Record<string, string>>;
  peerDependencies?: Readonly<Record<string, string>>;
  scripts?: Readonly<Record<string, string>>;
}>;

export type WorkspacePluginPackage = Readonly<{
  packageName: string;
  packageRoot: string;
  pluginEntryPath: string;
  watchRoot: string;
}>;

export interface WorkspacePluginPackageLookup {
  resolve(
    args: Readonly<{
      consumerRoot: string;
      repoRoot: string;
    }>,
  ): Promise<ReadonlyArray<WorkspacePluginPackage>>;
}

export class WorkspacePluginPackageResolver implements WorkspacePluginPackageLookup {
  async resolve(
    args: Readonly<{
      consumerRoot: string;
      repoRoot: string;
    }>,
  ): Promise<ReadonlyArray<WorkspacePluginPackage>> {
    const consumerPackageJson = await this.readPackageJson(path.resolve(args.consumerRoot, "package.json"));
    const referencedPackageNames = this.collectReferencedPackageNames(consumerPackageJson);
    if (referencedPackageNames.size === 0) {
      return [];
    }
    const packageDirectoryEntries = await this.readWorkspacePackageDirectories(path.resolve(args.repoRoot, "packages"));
    const resolvedPackages: WorkspacePluginPackage[] = [];
    for (const packageDirectoryEntry of packageDirectoryEntries) {
      const packageRoot = path.resolve(args.repoRoot, "packages", packageDirectoryEntry);
      const packageJson = await this.readPackageJson(path.resolve(packageRoot, "package.json"));
      const resolvedPackage = this.toWorkspacePluginPackage(packageRoot, packageJson, referencedPackageNames);
      if (resolvedPackage) {
        resolvedPackages.push(resolvedPackage);
      }
    }
    return resolvedPackages.sort((left, right) => left.packageName.localeCompare(right.packageName));
  }

  private collectReferencedPackageNames(packageJson: PackageJsonShape): ReadonlySet<string> {
    const packageNames = new Set<string>();
    this.addDependencyNames(packageNames, packageJson.dependencies);
    this.addDependencyNames(packageNames, packageJson.devDependencies);
    this.addDependencyNames(packageNames, packageJson.optionalDependencies);
    this.addDependencyNames(packageNames, packageJson.peerDependencies);
    return packageNames;
  }

  private addDependencyNames(
    packageNames: Set<string>,
    dependencies: Readonly<Record<string, string>> | undefined,
  ): void {
    if (!dependencies) {
      return;
    }
    Object.keys(dependencies).forEach((packageName: string) => {
      packageNames.add(packageName);
    });
  }

  private async readWorkspacePackageDirectories(packagesRoot: string): Promise<ReadonlyArray<string>> {
    try {
      const entries = await readdir(packagesRoot, { withFileTypes: true });
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name)
        .sort((left, right) => left.localeCompare(right));
    } catch {
      return [];
    }
  }

  private toWorkspacePluginPackage(
    packageRoot: string,
    packageJson: PackageJsonShape,
    referencedPackageNames: ReadonlySet<string>,
  ): WorkspacePluginPackage | null {
    if (!packageJson.name || !referencedPackageNames.has(packageJson.name)) {
      return null;
    }
    const pluginEntry = packageJson.codemation?.plugin?.trim();
    if (!pluginEntry) {
      return null;
    }
    const devScript = packageJson.scripts?.dev?.trim();
    if (!devScript) {
      return null;
    }
    const pluginEntryPath = path.resolve(packageRoot, pluginEntry);
    return {
      packageName: packageJson.name,
      packageRoot,
      pluginEntryPath,
      watchRoot: path.dirname(pluginEntryPath),
    };
  }

  private async readPackageJson(packageJsonPath: string): Promise<PackageJsonShape> {
    try {
      return JSON.parse(await readFile(packageJsonPath, "utf8")) as PackageJsonShape;
    } catch {
      return {};
    }
  }
}
