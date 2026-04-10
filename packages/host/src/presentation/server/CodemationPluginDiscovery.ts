import type { CodemationPackageManifest } from "../config/CodemationPackageManifest";
import { CodemationPluginPackageMetadata, type CodemationPlugin } from "../config/CodemationPlugin";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type CodemationDiscoveredPluginPackage = Readonly<{
  packageName: string;
  packageRoot: string;
  pluginEntry: string;
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
  private readonly pluginPackageMetadata = new CodemationPluginPackageMetadata();

  async discover(consumerRoot: string): Promise<ReadonlyArray<CodemationDiscoveredPluginPackage>> {
    const nodeModulesRoot = path.resolve(consumerRoot, "node_modules");
    const packageRoots = await this.collectPackageRoots(nodeModulesRoot);
    const discoveredPackages: CodemationDiscoveredPluginPackage[] = [];
    for (const packageRoot of packageRoots) {
      const packageJson = await this.readPackageJson(path.resolve(packageRoot, "package.json"));
      const pluginManifest = packageJson.codemation?.plugin;
      if (!packageJson.name || typeof pluginManifest !== "string" || pluginManifest.trim().length === 0) {
        continue;
      }
      discoveredPackages.push({
        packageName: packageJson.name,
        packageRoot,
        pluginEntry: pluginManifest,
        developmentEntry: await this.resolveDevelopmentPluginEntry(packageRoot),
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
      /* webpackIgnore: true */ this.resolvePluginModuleSpecifier(pluginModulePath)
    )) as Record<string, unknown>;
    const exportedValue = importedModule.default;
    const plugin = this.resolvePluginValue(exportedValue);
    if (!plugin) {
      throw new Error(`Plugin package "${discoveredPackage.packageName}" did not default-export a Codemation plugin.`);
    }
    return this.pluginPackageMetadata.attachPackageName(plugin, discoveredPackage.packageName);
  }

  private resolvePluginValue(value: unknown): CodemationPlugin | null {
    if (this.isPluginConfig(value)) {
      return value;
    }
    return null;
  }

  private isPluginConfig(value: unknown): value is CodemationPlugin {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const pluginValue = value as {
      credentialTypes?: unknown;
      register?: unknown;
      sandbox?: unknown;
    };
    if (pluginValue.register !== undefined && typeof pluginValue.register !== "function") {
      return false;
    }
    if (pluginValue.credentialTypes !== undefined && !Array.isArray(pluginValue.credentialTypes)) {
      return false;
    }
    return (
      pluginValue.register !== undefined ||
      pluginValue.credentialTypes !== undefined ||
      pluginValue.sandbox !== undefined ||
      Object.keys(pluginValue).length === 0
    );
  }

  private resolvePluginEntry(discoveredPackage: CodemationDiscoveredPluginPackage): string {
    const preferSource =
      process.env.CODEMATION_PREFER_PLUGIN_SOURCE_ENTRY === "true" &&
      typeof discoveredPackage.developmentEntry === "string" &&
      discoveredPackage.developmentEntry.trim().length > 0;
    const selectedEntry = preferSource ? discoveredPackage.developmentEntry : discoveredPackage.pluginEntry;
    return selectedEntry;
  }

  private async resolveDevelopmentPluginEntry(packageRoot: string): Promise<string | undefined> {
    const candidates = [
      path.resolve(packageRoot, "codemation.plugin.ts"),
      path.resolve(packageRoot, "codemation.plugin.js"),
      path.resolve(packageRoot, "src", "codemation.plugin.ts"),
      path.resolve(packageRoot, "src", "codemation.plugin.js"),
    ];
    for (const candidate of candidates) {
      if (await this.exists(candidate)) {
        return path.relative(packageRoot, candidate);
      }
    }
    return undefined;
  }

  private async exists(filePath: string): Promise<boolean> {
    try {
      await readFile(filePath, "utf8");
      return true;
    } catch {
      return false;
    }
  }

  private resolvePluginModuleSpecifier(pluginModulePath: string): string {
    return pathToFileURL(pluginModulePath).href;
  }
}
