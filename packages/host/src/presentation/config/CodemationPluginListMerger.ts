import { CodemationPluginPackageMetadata, type CodemationPlugin } from "./CodemationPlugin";

/**
 * Merges explicitly configured plugins with auto-discovered plugins.
 * Configured plugins are applied first; discovered plugins fill in gaps.
 * Plugins discovered from package.json manifests are deduped by npm package name so the same package is not
 * registered twice when the consumer config lists a discovered plugin explicitly and auto-discovery also finds it.
 */
export class CodemationPluginListMerger {
  constructor(private readonly packageMetadata: CodemationPluginPackageMetadata) {}

  merge(
    configuredPlugins: ReadonlyArray<CodemationPlugin>,
    discoveredPlugins: ReadonlyArray<CodemationPlugin>,
  ): ReadonlyArray<CodemationPlugin> {
    const pluginsByPackageId = new Map<string, CodemationPlugin>();
    const pluginsByReference = new Set<CodemationPlugin>();
    const result: CodemationPlugin[] = [];

    for (const plugin of configuredPlugins) {
      this.tryAdd(plugin, pluginsByPackageId, pluginsByReference, result);
    }
    for (const plugin of discoveredPlugins) {
      this.tryAdd(plugin, pluginsByPackageId, pluginsByReference, result);
    }
    return result;
  }

  private tryAdd(
    plugin: CodemationPlugin,
    pluginsByPackageId: Map<string, CodemationPlugin>,
    pluginsByReference: Set<CodemationPlugin>,
    result: CodemationPlugin[],
  ): void {
    const packageId = this.packageMetadata.readPackageName(plugin);
    if (packageId) {
      if (pluginsByPackageId.has(packageId)) {
        return;
      }
      pluginsByPackageId.set(packageId, plugin);
      result.push(plugin);
      return;
    }
    if (pluginsByReference.has(plugin)) {
      return;
    }
    pluginsByReference.add(plugin);
    result.push(plugin);
  }
}
