import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { CodemationPluginPackageMetadata } from "../../src/presentation/config/CodemationPlugin";
import { CodemationPluginDiscovery } from "../../src/presentation/server/CodemationPluginDiscovery";

describe("CodemationPluginDiscovery", () => {
  const tempRoots: string[] = [];

  afterEach(async () => {
    while (tempRoots.length > 0) {
      const tempRoot = tempRoots.pop();
      if (tempRoot) {
        await rm(tempRoot, { force: true, recursive: true });
      }
    }
  });

  it("discovers the simplified codemation.plugin manifest and resolves the default export", async () => {
    const consumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-plugin-discovery-"));
    tempRoots.push(consumerRoot);
    const packageRoot = path.join(consumerRoot, "node_modules", "@codemation", "example-plugin");
    await mkdir(path.join(packageRoot, "dist"), { recursive: true });
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify(
        {
          name: "@codemation/example-plugin",
          type: "module",
          codemation: {
            plugin: "./dist/codemation.plugin.js",
          },
        },
        null,
        2,
      ),
      "utf8",
    );
    await writeFile(
      path.join(packageRoot, "dist", "codemation.plugin.js"),
      ["const plugin = {", "  register() {},", "};", "export default plugin;", ""].join("\n"),
      "utf8",
    );

    const discovery = new CodemationPluginDiscovery();
    const discoveredPackages = await discovery.discover(consumerRoot);
    const resolvedPackages = await discovery.resolveDiscoveredPackages(discoveredPackages);
    const metadata = new CodemationPluginPackageMetadata();

    expect(discoveredPackages).toEqual([
      {
        developmentEntry: undefined,
        packageName: "@codemation/example-plugin",
        packageRoot,
        pluginEntry: "./dist/codemation.plugin.js",
      },
    ]);
    expect(resolvedPackages).toHaveLength(1);
    expect(typeof resolvedPackages[0]?.plugin.register).toBe("function");
    expect(metadata.readPackageName(resolvedPackages[0]!.plugin)).toBe("@codemation/example-plugin");
  });
});
