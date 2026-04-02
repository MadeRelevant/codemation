import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { CodemationConsumerConfigLoader } from "../../../src/presentation/server/CodemationConsumerConfigLoader";

describe("CodemationConsumerConfigLoader", () => {
  const tempRoots: string[] = [];
  let previousCredentialsMasterKey: string | undefined;

  afterEach(async () => {
    if (previousCredentialsMasterKey === undefined) {
      delete process.env.CODEMATION_CREDENTIALS_MASTER_KEY;
    } else {
      process.env.CODEMATION_CREDENTIALS_MASTER_KEY = previousCredentialsMasterKey;
    }
    previousCredentialsMasterKey = undefined;
    while (tempRoots.length > 0) {
      const tempRoot = tempRoots.pop();
      if (tempRoot) {
        await rm(tempRoot, { force: true, recursive: true });
      }
    }
  });

  it("reloads plugin-dev config overrides when the plugin entry changes", async () => {
    const repoPluginDevRoot = path.resolve(process.cwd(), "apps", "plugin-dev");
    const consumerRoot = await mkdtemp(path.join(repoPluginDevRoot, ".config-loader-fixture-"));
    tempRoots.push(consumerRoot);

    const pluginEntryPath = path.join(consumerRoot, "codemation.plugin.ts");
    const configOverridePath = path.join(consumerRoot, ".codemation", "plugin-dev", "codemation.config.ts");
    await mkdir(path.dirname(configOverridePath), { recursive: true });

    await writeFile(
      pluginEntryPath,
      [
        "const plugin = {",
        "  sandbox: {",
        "    config: {",
        "      workflows: [",
        "        {",
        '          id: "wf.plugin-dev.http",',
        '          name: "Plugin dev HTTP demo",',
        "          nodes: [",
        '            { id: "PluginDevHttpDemoNode:1", name: "Fetch demo" },',
        "          ],",
        "          edges: [],",
        "        },",
        "      ],",
        "    },",
        "  },",
        "  register() {},",
        "};",
        "",
        "export default plugin;",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      configOverridePath,
      [
        'import plugin from "../../codemation.plugin.ts";',
        "",
        "const sandboxEnv = plugin.sandbox?.env ?? {};",
        "for (const [name, value] of Object.entries(sandboxEnv)) {",
        "  process.env[name] ??= value;",
        "}",
        "",
        "const sandbox = plugin.sandbox?.config ?? {};",
        "const config = {",
        "  ...sandbox,",
        "  plugins: [...(sandbox.plugins ?? []), plugin],",
        "};",
        "",
        "export default config;",
        "",
      ].join("\n"),
      "utf8",
    );

    const loader = new CodemationConsumerConfigLoader();

    const initial = await loader.load({
      consumerRoot,
      configPathOverride: configOverridePath,
    });
    expect(initial.config.workflows?.[0]?.nodes?.[0]?.name).toBe("Fetch demo");

    await writeFile(
      pluginEntryPath,
      [
        "const plugin = {",
        "  sandbox: {",
        "    config: {",
        "      workflows: [",
        "        {",
        '          id: "wf.plugin-dev.http",',
        '          name: "Plugin dev HTTP demo",',
        "          nodes: [",
        '            { id: "PluginDevHttpDemoNode:1", name: "Fetch demo updated" },',
        "          ],",
        "          edges: [],",
        "        },",
        "      ],",
        "    },",
        "  },",
        "  register() {},",
        "};",
        "",
        "export default plugin;",
        "",
      ].join("\n"),
      "utf8",
    );

    const updated = await loader.load({
      consumerRoot,
      configPathOverride: configOverridePath,
    });
    expect(updated.config.workflows?.[0]?.nodes?.[0]?.name).toBe("Fetch demo updated");
  });

  it("applies sandbox env defaults without overwriting explicit process env values", async () => {
    const repoPluginDevRoot = path.resolve(process.cwd(), "apps", "plugin-dev");
    const consumerRoot = await mkdtemp(path.join(repoPluginDevRoot, ".config-loader-fixture-"));
    tempRoots.push(consumerRoot);

    const pluginEntryPath = path.join(consumerRoot, "codemation.plugin.ts");
    const configOverridePath = path.join(consumerRoot, ".codemation", "plugin-dev", "codemation.config.ts");
    await mkdir(path.dirname(configOverridePath), { recursive: true });

    await writeFile(
      pluginEntryPath,
      [
        "const plugin = {",
        "  sandbox: {",
        "    env: {",
        '      CODEMATION_CREDENTIALS_MASTER_KEY: "sandbox-default-master-key",',
        "    },",
        "    config: { workflows: [] },",
        "  },",
        "  register() {},",
        "};",
        "",
        "export default plugin;",
        "",
      ].join("\n"),
      "utf8",
    );
    await writeFile(
      configOverridePath,
      [
        'import plugin from "../../codemation.plugin.ts";',
        "",
        "const sandboxEnv = plugin.sandbox?.env ?? {};",
        "for (const [name, value] of Object.entries(sandboxEnv)) {",
        "  process.env[name] ??= value;",
        "}",
        "",
        "const sandbox = plugin.sandbox?.config ?? {};",
        "const config = {",
        "  ...sandbox,",
        "  plugins: [...(sandbox.plugins ?? []), plugin],",
        "};",
        "",
        "export default config;",
        "",
      ].join("\n"),
      "utf8",
    );

    const loader = new CodemationConsumerConfigLoader();
    previousCredentialsMasterKey = process.env.CODEMATION_CREDENTIALS_MASTER_KEY;
    delete process.env.CODEMATION_CREDENTIALS_MASTER_KEY;

    await loader.load({
      consumerRoot,
      configPathOverride: configOverridePath,
    });
    expect(process.env.CODEMATION_CREDENTIALS_MASTER_KEY).toBe("sandbox-default-master-key");

    process.env.CODEMATION_CREDENTIALS_MASTER_KEY = "shell-provided-master-key";
    await loader.load({
      consumerRoot,
      configPathOverride: configOverridePath,
    });
    expect(process.env.CODEMATION_CREDENTIALS_MASTER_KEY).toBe("shell-provided-master-key");
  });
});
