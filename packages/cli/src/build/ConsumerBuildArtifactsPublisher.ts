import type { CodemationDiscoveredPluginPackage } from "@codemation/host/server";
import { randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { ConsumerOutputBuildSnapshot } from "../consumer/ConsumerOutputBuilder";

export type ConsumerBuildManifest = Readonly<{
  buildVersion: string;
  consumerRoot: string;
  entryPath: string;
  manifestPath: string;
  pluginEntryPath: string;
  workflowSourcePaths: ReadonlyArray<string>;
}>;

export class ConsumerBuildArtifactsPublisher {
  private static readonly nonRuntimePluginEntryExtensions = new Set([".cts", ".mts", ".ts", ".tsx"]);

  async publish(
    snapshot: ConsumerOutputBuildSnapshot,
    discoveredPlugins: ReadonlyArray<CodemationDiscoveredPluginPackage>,
  ): Promise<ConsumerBuildManifest> {
    const pluginEntryPath = await this.writeDiscoveredPluginsOutput(snapshot, discoveredPlugins);
    return await this.writeBuildManifest(snapshot, pluginEntryPath);
  }

  private async writeDiscoveredPluginsOutput(
    snapshot: ConsumerOutputBuildSnapshot,
    discoveredPlugins: ReadonlyArray<CodemationDiscoveredPluginPackage>,
  ): Promise<string> {
    const outputPath = path.resolve(snapshot.emitOutputRoot, "plugins.js");
    await mkdir(path.dirname(outputPath), { recursive: true });
    const outputLines: string[] = ["const codemationDiscoveredPlugins = [];", ""];
    discoveredPlugins.forEach((discoveredPlugin: CodemationDiscoveredPluginPackage, index: number) => {
      const pluginModulePath = path.resolve(discoveredPlugin.packageRoot, this.resolvePluginEntry(discoveredPlugin));
      const pluginFileUrl = pathToFileURL(pluginModulePath).href;
      outputLines.push(`const pluginModule${index} = await import(${JSON.stringify(pluginFileUrl)});`);
      outputLines.push(
        `const pluginValue${index} = pluginModule${index}.default ?? pluginModule${index}.codemationPlugin;`,
      );
      outputLines.push(`if (pluginValue${index} && typeof pluginValue${index}.register === "function") {`);
      outputLines.push(`  codemationDiscoveredPlugins.push(pluginValue${index});`);
      outputLines.push(
        `} else if (typeof pluginValue${index} === "function" && pluginValue${index}.prototype && typeof pluginValue${index}.prototype.register === "function") {`,
      );
      outputLines.push(`  codemationDiscoveredPlugins.push(new pluginValue${index}());`);
      outputLines.push("}");
      outputLines.push("");
    });
    outputLines.push("export { codemationDiscoveredPlugins };");
    outputLines.push("export default codemationDiscoveredPlugins;");
    outputLines.push("");
    await writeFile(outputPath, outputLines.join("\n"), "utf8");
    return outputPath;
  }

  private async writeBuildManifest(
    snapshot: ConsumerOutputBuildSnapshot,
    pluginEntryPath: string,
  ): Promise<ConsumerBuildManifest> {
    const manifest: ConsumerBuildManifest = {
      buildVersion: snapshot.buildVersion,
      consumerRoot: snapshot.consumerRoot,
      entryPath: snapshot.outputEntryPath,
      manifestPath: snapshot.manifestPath,
      pluginEntryPath,
      workflowSourcePaths: snapshot.workflowSourcePaths,
    };
    await mkdir(path.dirname(snapshot.manifestPath), { recursive: true });
    const temporaryManifestPath = `${snapshot.manifestPath}.${snapshot.buildVersion}.${randomUUID()}.tmp`;
    await writeFile(temporaryManifestPath, JSON.stringify(manifest, null, 2), "utf8");
    await rename(temporaryManifestPath, snapshot.manifestPath);
    return manifest;
  }

  private resolvePluginEntry(discoveredPlugin: CodemationDiscoveredPluginPackage): string {
    const pluginEntry = discoveredPlugin.pluginEntry;
    const pluginEntryExtension = path.extname(pluginEntry).toLowerCase();
    if (ConsumerBuildArtifactsPublisher.nonRuntimePluginEntryExtensions.has(pluginEntryExtension)) {
      throw new Error(
        [
          `Plugin package "${discoveredPlugin.packageName}" points codemation.plugin at a TypeScript source entry (${pluginEntry}).`,
          "Discovered plugins must expose a runnable JavaScript entry so consumer build artifacts can import them with Node.",
        ].join(" "),
      );
    }
    return pluginEntry;
  }
}
