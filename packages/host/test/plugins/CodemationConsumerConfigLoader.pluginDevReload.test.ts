import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { CodemationConsumerConfigLoader } from "../../src/presentation/server/CodemationConsumerConfigLoader";

class PluginDevConfigReloadFixture {
  private readonly loader = new CodemationConsumerConfigLoader();
  private consumerRoot: string | null = null;

  async create(): Promise<void> {
    this.consumerRoot = await mkdtemp(path.join(os.tmpdir(), "codemation-plugin-dev-reload-"));
    await mkdir(path.join(this.consumerRoot, ".codemation", "plugin-dev"), { recursive: true });
    await mkdir(path.join(this.consumerRoot, "src"), { recursive: true });
    await writeFile(path.join(this.consumerRoot, "package.json"), JSON.stringify({ type: "module" }, null, 2), "utf8");
    await this.writePluginConfig();
  }

  async dispose(): Promise<void> {
    if (!this.consumerRoot) {
      return;
    }
    const root = this.consumerRoot;
    this.consumerRoot = null;
    await rm(root, { force: true, recursive: true });
  }

  async writeWorkflow(name: string): Promise<void> {
    await writeFile(
      path.join(this.requireConsumerRoot(), "src", "workflow.js"),
      [
        "const workflow = {",
        '  id: "wf.plugin.dev.reload",',
        `  name: ${JSON.stringify(name)},`,
        "  nodes: [],",
        "  edges: [],",
        "};",
        "",
        "export default workflow;",
        "",
      ].join("\n"),
      "utf8",
    );
  }

  async writePluginEntry(): Promise<void> {
    await writeFile(
      path.join(this.requireConsumerRoot(), "codemation.plugin.js"),
      [
        'import workflow from "./src/workflow.js";',
        "",
        "const plugin = {",
        "  sandbox: {",
        "    workflows: [workflow],",
        "  },",
        "};",
        "",
        "export default plugin;",
        "",
      ].join("\n"),
      "utf8",
    );
  }

  async loadWorkflowName(): Promise<string> {
    const resolution = await this.loader.load({
      consumerRoot: this.requireConsumerRoot(),
      configPathOverride: path.join(this.requireConsumerRoot(), ".codemation", "plugin-dev", "codemation.config.js"),
    });
    const workflows = resolution.config.workflows ?? [];
    return workflows[0]?.name ?? "";
  }

  private async writePluginConfig(): Promise<void> {
    await writeFile(
      path.join(this.requireConsumerRoot(), ".codemation", "plugin-dev", "codemation.config.js"),
      [
        'import plugin from "../../codemation.plugin.js";',
        "",
        "const sandbox = plugin.sandbox ?? {};",
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
  }

  private requireConsumerRoot(): string {
    if (!this.consumerRoot) {
      throw new Error("Consumer root has not been created.");
    }
    return this.consumerRoot;
  }
}

describe("CodemationConsumerConfigLoader plugin dev reload", () => {
  const originalDevServerToken = process.env.CODEMATION_DEV_SERVER_TOKEN;
  const fixture = new PluginDevConfigReloadFixture();

  afterEach(async () => {
    if (originalDevServerToken === undefined) {
      delete process.env.CODEMATION_DEV_SERVER_TOKEN;
    } else {
      process.env.CODEMATION_DEV_SERVER_TOKEN = originalDevServerToken;
    }
    await fixture.dispose();
  });

  it("reloads nested plugin source files when the generated plugin-dev config path stays unchanged", async () => {
    process.env.CODEMATION_DEV_SERVER_TOKEN = "plugin-dev-reload";
    await fixture.create();
    await fixture.writeWorkflow("Initial workflow");
    await fixture.writePluginEntry();

    expect(await fixture.loadWorkflowName()).toBe("Initial workflow");

    await fixture.writeWorkflow("Updated workflow");

    expect(await fixture.loadWorkflowName()).toBe("Updated workflow");
  });
});
