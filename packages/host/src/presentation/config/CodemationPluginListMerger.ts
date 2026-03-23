import type { CodemationPlugin } from "./CodemationPlugin";

/**
 * Merges explicitly configured plugins with auto-discovered plugins.
 * Configured plugins are applied first; discovered plugins fill in gaps.
 * Plugins that declare `pluginPackageId` are deduped by that string so the same npm package is not
 * registered twice when the consumer config lists a plugin and discovery also finds it, or when two
 * module evaluations produce different `constructor` identities for the same logical plugin.
 */
export class CodemationPluginListMerger {
  merge(
    configuredPlugins: ReadonlyArray<CodemationPlugin>,
    discoveredPlugins: ReadonlyArray<CodemationPlugin>,
  ): ReadonlyArray<CodemationPlugin> {
    const pluginsByPackageId = new Map<string, CodemationPlugin>();
    const pluginsByConstructor = new Map<unknown, CodemationPlugin>();
    const result: CodemationPlugin[] = [];

    const tryAdd = (plugin: CodemationPlugin): void => {
      const packageId = plugin.pluginPackageId;
      if (typeof packageId === "string" && packageId.trim().length > 0) {
        const key = packageId.trim();
        if (pluginsByPackageId.has(key)) {
          return;
        }
        pluginsByPackageId.set(key, plugin);
        result.push(plugin);
        return;
      }
      const constructorKey = Object.getPrototypeOf(plugin)?.constructor ?? plugin;
      if (pluginsByConstructor.has(constructorKey)) {
        return;
      }
      pluginsByConstructor.set(constructorKey, plugin);
      result.push(plugin);
    };

    for (const plugin of configuredPlugins) {
      tryAdd(plugin);
    }
    for (const plugin of discoveredPlugins) {
      tryAdd(plugin);
    }
    return result;
  }
}
