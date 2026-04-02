import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";

import { PluginDevConfigFactory } from "../src/dev/PluginDevConfigFactory";

let teardownPluginRoot: string | null = null;

afterEach(async () => {
  if (teardownPluginRoot) {
    await rm(teardownPluginRoot, { force: true, recursive: true }).catch(() => null);
    teardownPluginRoot = null;
  }
});

test("prepare emits sandbox env defaults and sandbox config projection", async () => {
  const pluginRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-plugin-dev-config-factory-"));
  teardownPluginRoot = pluginRoot;
  await writeFile(
    path.join(pluginRoot, "codemation.plugin.ts"),
    [
      "const plugin = {",
      "  sandbox: {",
      "    env: { CODEMATION_CREDENTIALS_MASTER_KEY: 'sandbox-default-master-key' },",
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

  const bootstrap = await new PluginDevConfigFactory().prepare(pluginRoot);
  const generated = await readFile(bootstrap.configPath, "utf8");

  assert.match(generated, /plugin\.sandbox\?\.env/);
  assert.match(generated, /process\.env\[name\] \?\?= value/);
  assert.match(generated, /plugin\.sandbox\?\.config/);
  assert.match(generated, /plugins: \[\.\.\.\(sandbox\.plugins \?\? \[\]\), plugin\]/);
});
