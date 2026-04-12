import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "vitest";

import { WorkspacePluginPackageResolver } from "../src/dev/WorkspacePluginPackageResolver";

class WorkspacePluginPackageResolverFixture {
  private root: string | null = null;

  async create(): Promise<void> {
    this.root = await mkdtemp(path.join(os.tmpdir(), "codemation-workspace-plugin-resolver-"));
    await this.writeConsumerPackageJson({
      dependencies: {
        "@codemation/core": "workspace:*",
        "@codemation/core-nodes-gmail": "workspace:*",
      },
    });
    await this.writeWorkspacePackageJson("core", {
      name: "@codemation/core",
      scripts: {
        dev: "tsdown --watch",
      },
    });
    await this.writeWorkspacePackageJson("core-nodes-gmail", {
      name: "@codemation/core-nodes-gmail",
      codemation: {
        plugin: "./dist/codemation.plugin.js",
      },
      scripts: {
        dev: "tsdown codemation.plugin.ts --out-dir dist --watch",
      },
    });
    await this.writeWorkspacePackageJson("unused-plugin", {
      name: "@codemation/unused-plugin",
      codemation: {
        plugin: "./dist/codemation.plugin.js",
      },
      scripts: {
        dev: "tsdown codemation.plugin.ts --out-dir dist --watch",
      },
    });
  }

  async dispose(): Promise<void> {
    if (!this.root) {
      return;
    }
    const currentRoot = this.root;
    this.root = null;
    await rm(currentRoot, { force: true, recursive: true }).catch(() => null);
  }

  consumerRoot(): string {
    return path.join(this.requireRoot(), "apps", "test-dev");
  }

  repoRoot(): string {
    return this.requireRoot();
  }

  private async writeConsumerPackageJson(packageJson: Record<string, unknown>): Promise<void> {
    await this.writeJson(path.join(this.consumerRoot(), "package.json"), {
      name: "@codemation/test-dev",
      private: true,
      ...packageJson,
    });
  }

  private async writeWorkspacePackageJson(directoryName: string, packageJson: Record<string, unknown>): Promise<void> {
    await this.writeJson(path.join(this.requireRoot(), "packages", directoryName, "package.json"), {
      type: "module",
      ...packageJson,
    });
  }

  private async writeJson(filePath: string, value: Record<string, unknown>): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  }

  private requireRoot(): string {
    if (!this.root) {
      throw new Error("Fixture root has not been created.");
    }
    return this.root;
  }
}

const fixture = new WorkspacePluginPackageResolverFixture();

afterEach(async () => {
  await fixture.dispose();
});

test("WorkspacePluginPackageResolver returns only plugin workspace packages referenced by the consumer", async () => {
  await fixture.create();

  const packages = await new WorkspacePluginPackageResolver().resolve({
    consumerRoot: fixture.consumerRoot(),
    repoRoot: fixture.repoRoot(),
  });

  assert.deepEqual(packages, [
    {
      packageName: "@codemation/core-nodes-gmail",
      packageRoot: path.join(fixture.repoRoot(), "packages", "core-nodes-gmail"),
      pluginEntryPath: path.join(fixture.repoRoot(), "packages", "core-nodes-gmail", "dist", "codemation.plugin.js"),
      watchRoot: path.join(fixture.repoRoot(), "packages", "core-nodes-gmail", "dist"),
    },
  ]);
});
