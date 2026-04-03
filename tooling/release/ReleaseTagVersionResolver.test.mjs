import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { ReleaseTagVersionResolver } from "./ReleaseTagVersionResolver.mjs";

class ReleaseTagVersionResolverTest {
  async shouldResolveTheSinglePublishedVersion() {
    const workspaceDirectory = await this.#createWorkspaceDirectory();

    try {
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "core",
        packageName: "@codemation/core",
        version: "1.2.3",
      });
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "host",
        packageName: "@codemation/host",
        version: "1.2.3",
      });

      const resolver = new ReleaseTagVersionResolver({
        rootDirectory: workspaceDirectory,
      });

      await assert.doesNotReject(async () => {
        assert.equal(await resolver.resolve(), "1.2.3");
      });
    } finally {
      await rm(workspaceDirectory, { recursive: true, force: true });
    }
  }

  async shouldResolveTheMostCommonPublishedVersion() {
    const workspaceDirectory = await this.#createWorkspaceDirectory();

    try {
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "agent-skills",
        packageName: "@codemation/agent-skills",
        version: "0.1.0",
      });
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "core",
        packageName: "@codemation/core",
        version: "0.0.19",
      });
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "host",
        packageName: "@codemation/host",
        version: "0.0.19",
      });
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "next-host",
        packageName: "@codemation/next-host",
        version: "0.0.19",
      });

      const resolver = new ReleaseTagVersionResolver({
        rootDirectory: workspaceDirectory,
      });

      assert.equal(await resolver.resolve(), "0.0.19");
    } finally {
      await rm(workspaceDirectory, { recursive: true, force: true });
    }
  }

  async shouldBreakVersionCountTiesWithTheHighestVersion() {
    const workspaceDirectory = await this.#createWorkspaceDirectory();

    try {
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "core",
        packageName: "@codemation/core",
        version: "0.2.0",
      });
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "host",
        packageName: "@codemation/host",
        version: "0.2.0",
      });
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "cli",
        packageName: "@codemation/cli",
        version: "0.1.9",
      });
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "node-example",
        packageName: "@codemation/node-example",
        version: "0.1.9",
      });

      const resolver = new ReleaseTagVersionResolver({
        rootDirectory: workspaceDirectory,
      });

      assert.equal(await resolver.resolve(), "0.2.0");
    } finally {
      await rm(workspaceDirectory, { recursive: true, force: true });
    }
  }

  async #createWorkspaceDirectory() {
    const workspaceDirectory = await mkdtemp(path.join(os.tmpdir(), "codemation-release-tag-"));
    await mkdir(path.join(workspaceDirectory, "packages"), {
      recursive: true,
    });

    return workspaceDirectory;
  }

  async #writePackage({ workspaceDirectory, directoryName, packageName, version }) {
    const packageDirectory = path.join(workspaceDirectory, "packages", directoryName);

    await mkdir(packageDirectory, { recursive: true });
    await writeFile(
      path.join(packageDirectory, "package.json"),
      JSON.stringify({ name: packageName, version }, null, 2),
      "utf8",
    );
  }
}

const releaseTagVersionResolverTest = new ReleaseTagVersionResolverTest();

test(
  "resolves the shared published version when all packages match",
  releaseTagVersionResolverTest.shouldResolveTheSinglePublishedVersion.bind(releaseTagVersionResolverTest),
);

test(
  "resolves the most common published version for mixed release bumps",
  releaseTagVersionResolverTest.shouldResolveTheMostCommonPublishedVersion.bind(releaseTagVersionResolverTest),
);

test(
  "breaks release-version ties with the highest semantic version",
  releaseTagVersionResolverTest.shouldBreakVersionCountTiesWithTheHighestVersion.bind(releaseTagVersionResolverTest),
);
