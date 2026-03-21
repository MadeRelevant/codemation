import type { CodemationPackageManifest,CodemationPlugin } from "@codemation/host";
import { readFile,readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type CodemationDiscoveredPluginPackage = Readonly<{
  packageName: string;
  packageRoot: string;
  manifest: NonNullable<CodemationPackageManifest["plugin"]>;
}>;

export type CodemationResolvedPluginPackage = Readonly<
  CodemationDiscoveredPluginPackage & {
    plugin: CodemationPlugin;
  }
>;

type PackageJsonShape = Readonly<{
  codemation?: CodemationPackageManifest;
  name?: string;
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
      });
    }
    return discoveredPackages.sort((left, right) => left.packageName.localeCompare(right.packageName));
  }

  async resolvePlugins(consumerRoot: string): Promise<ReadonlyArray<CodemationResolvedPluginPackage>> {
    const discoveredPackages = await this.discover(consumerRoot);
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
    const pluginModulePath = path.resolve(discoveredPackage.packageRoot, discoveredPackage.manifest.entry);
    const importedModule = (await import(pathToFileURL(pluginModulePath).href)) as Record<string, unknown>;
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
    return Boolean(value) && typeof value === "object" && typeof (value as { register?: unknown }).register === "function";
  }

  private isPluginConstructor(value: unknown): value is new () => CodemationPlugin {
    return typeof value === "function" && this.isPlugin(value.prototype);
  }
}
