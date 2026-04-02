import type { CodemationPackageManifest } from "../config/CodemationPackageManifest";
import type { CodemationPlugin } from "../config/CodemationPlugin";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type CodemationDiscoveredPluginPackage = Readonly<{
  packageName: string;
  packageRoot: string;
  manifest: NonNullable<CodemationPackageManifest["plugin"]>;
  developmentEntry?: string;
}>;

export type CodemationResolvedPluginPackage = Readonly<
  CodemationDiscoveredPluginPackage & {
    plugin: CodemationPlugin;
  }
>;

type PackageJsonShape = Readonly<{
  codemation?: CodemationPackageManifest;
  name?: string;
  exports?: Readonly<Record<string, unknown>>;
}>;

export class CodemationPluginDiscovery {
  async discover(consumerRoot: string): Promise<ReadonlyArray<CodemationDiscoveredPluginPackage>> {
    const nodeModulesRoot = path.resolve(consumerRoot, "node_modules");
    const packageRoots = await this.collectPackageRoots(nodeModulesRoot);
    const discoveredPackages: CodemationDiscoveredPluginPackage[] = [];
    for (const packageRoot of packageRoots) {
      const packageJson = await this.readPackageJson(path.resolve(packageRoot, "package.json"));
      const pluginManifest = packageJson.codemation?.plugin;
      if (!packageJson.name || !pluginManifest || pluginManifest.kind !== "plugin") {
        continue;
      }
      discoveredPackages.push({
        packageName: packageJson.name,
        packageRoot,
        manifest: pluginManifest,
        developmentEntry: this.resolveDevelopmentPluginEntry(packageJson),
      });
    }
    return discoveredPackages.sort((left, right) => left.packageName.localeCompare(right.packageName));
  }

  async resolvePlugins(consumerRoot: string): Promise<ReadonlyArray<CodemationResolvedPluginPackage>> {
    const discoveredPackages = await this.discover(consumerRoot);
    return await this.resolveDiscoveredPackages(discoveredPackages);
  }

  async resolveDiscoveredPackages(
    discoveredPackages: ReadonlyArray<CodemationDiscoveredPluginPackage>,
  ): Promise<ReadonlyArray<CodemationResolvedPluginPackage>> {
    const resolvedPackages: CodemationResolvedPluginPackage[] = [];
    for (const discoveredPackage of discoveredPackages) {
      resolvedPackages.push({
        ...discoveredPackage,
        plugin: await this.loadPlugin(discoveredPackage),
      });
    }
    return resolvedPackages;
  }

  private async collectPackageRoots(nodeModulesRoot: string): Promise<ReadonlyArray<string>> {
    try {
      const entries = await readdir(nodeModulesRoot, { withFileTypes: true });
      const packageRoots: string[] = [];
      for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isSymbolicLink()) {
          continue;
        }
        if (entry.name.startsWith("@")) {
          const scopedEntries = await readdir(path.resolve(nodeModulesRoot, entry.name), { withFileTypes: true });
          for (const scopedEntry of scopedEntries) {
            if (scopedEntry.isDirectory() || scopedEntry.isSymbolicLink()) {
              packageRoots.push(path.resolve(nodeModulesRoot, entry.name, scopedEntry.name));
            }
          }
          continue;
        }
        packageRoots.push(path.resolve(nodeModulesRoot, entry.name));
      }
      return packageRoots;
    } catch {
      return [];
    }
  }

  private async readPackageJson(packageJsonPath: string): Promise<PackageJsonShape> {
    try {
      const rawPackageJson = await readFile(packageJsonPath, "utf8");
      return JSON.parse(rawPackageJson) as PackageJsonShape;
    } catch {
      return {};
    }
  }

  private async loadPlugin(discoveredPackage: CodemationDiscoveredPluginPackage): Promise<CodemationPlugin> {
    const pluginModulePath = path.resolve(discoveredPackage.packageRoot, this.resolvePluginEntry(discoveredPackage));
    const importedModule = (await import(
      /* webpackIgnore: true */ await this.createImportSpecifier(pluginModulePath)
    )) as Record<string, unknown>;
    const pluginExportName = discoveredPackage.manifest.exportName;
    const explicitExport = pluginExportName ? importedModule[pluginExportName] : undefined;
    const exportedValue = explicitExport ?? importedModule.default ?? importedModule.codemationPlugin;
    const plugin = this.resolvePluginValue(exportedValue);
    if (!plugin) {
      throw new Error(`Plugin package "${discoveredPackage.packageName}" did not export a Codemation plugin instance.`);
    }
    return plugin;
  }

  private resolvePluginValue(value: unknown): CodemationPlugin | null {
    if (this.isPlugin(value)) {
      return value;
    }
    if (this.isPluginConstructor(value)) {
      return new value();
    }
    return null;
  }

  private isPlugin(value: unknown): value is CodemationPlugin {
    return (
      Boolean(value) && typeof value === "object" && typeof (value as { register?: unknown }).register === "function"
    );
  }

  private isPluginConstructor(value: unknown): value is new () => CodemationPlugin {
    return typeof value === "function" && this.isPlugin(value.prototype);
  }

  private resolvePluginEntry(discoveredPackage: CodemationDiscoveredPluginPackage): string {
    if (
      process.env.CODEMATION_PREFER_PLUGIN_SOURCE_ENTRY === "true" &&
      typeof discoveredPackage.developmentEntry === "string" &&
      discoveredPackage.developmentEntry.trim().length > 0
    ) {
      return discoveredPackage.developmentEntry;
    }
    return discoveredPackage.manifest.entry;
  }

  private resolveDevelopmentPluginEntry(packageJson: PackageJsonShape): string | undefined {
    const exportRecord = packageJson.exports?.["./codemation-plugin"];
    if (!exportRecord || typeof exportRecord !== "object") {
      return undefined;
    }
    const importPath = (exportRecord as { import?: unknown }).import;
    return typeof importPath === "string" && importPath.trim().length > 0 ? importPath : undefined;
  }

  private async createImportSpecifier(filePath: string): Promise<string> {
    const fileUrl = pathToFileURL(filePath);
    const fileStats = await stat(filePath);
    fileUrl.searchParams.set("t", String(fileStats.mtimeMs));
    return fileUrl.href;
  }
}
