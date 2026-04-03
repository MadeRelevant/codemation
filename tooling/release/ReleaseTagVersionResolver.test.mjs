import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { ReleaseTagVersionResolver } from "./ReleaseTagVersionResolver.mjs";

class ReleaseTagVersionResolverTest {
  constructor() {
    this.execFileAsync = promisify(execFile);
  }

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

  async shouldResolveTheVersionFromPackagesChangedInHeadCommit() {
    const workspaceDirectory = await this.#createWorkspaceDirectory();

    try {
      await this.#initializeGitRepository(workspaceDirectory);
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
      await this.#commitAll(workspaceDirectory, "initial versions");
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "core",
        packageName: "@codemation/core",
        version: "0.0.20",
      });
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "next-host",
        packageName: "@codemation/next-host",
        version: "0.0.20",
      });
      await this.#commitAll(workspaceDirectory, "release versions");

      const resolver = new ReleaseTagVersionResolver({
        rootDirectory: workspaceDirectory,
      });

      assert.equal(await resolver.resolve(), "0.0.20");
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

  async #initializeGitRepository(workspaceDirectory) {
    await this.execFileAsync("git", ["init"], { cwd: workspaceDirectory });
    await this.execFileAsync("git", ["config", "user.name", "Codemation Tests"], { cwd: workspaceDirectory });
    await this.execFileAsync("git", ["config", "user.email", "tests@codemation.local"], { cwd: workspaceDirectory });
  }

  async #commitAll(workspaceDirectory, message) {
    await this.execFileAsync("git", ["add", "."], { cwd: workspaceDirectory });
    await this.execFileAsync("git", ["commit", "-m", message], { cwd: workspaceDirectory });
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
  "resolves the version from packages changed in the head commit",
  releaseTagVersionResolverTest.shouldResolveTheVersionFromPackagesChangedInHeadCommit.bind(
    releaseTagVersionResolverTest,
  ),
);

test(
  "breaks release-version ties with the highest semantic version",
  releaseTagVersionResolverTest.shouldBreakVersionCountTiesWithTheHighestVersion.bind(releaseTagVersionResolverTest),
);
