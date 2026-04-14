import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { test } from "vitest";

import { GitHubReleaseNotesBuilder } from "./GitHubReleaseNotesBuilder.mjs";

class GitHubReleaseNotesBuilderTest {
  constructor(runtimeProcess) {
    this.runtimeProcess = runtimeProcess;
    this.execFileAsync = promisify(execFile);
  }

  async shouldAggregateChangedPackages() {
    const workspaceDirectory = await this.#createWorkspaceDirectory();

    try {
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "core",
        packageName: "@codemation/core",
        version: "1.2.3",
        changelog: [
          "# @codemation/core",
          "",
          "## 1.2.3",
          "",
          "### Patch Changes",
          "",
          "- Add PR links for release notes.",
          "",
          "## 1.2.2",
          "",
          "### Patch Changes",
          "",
          "- Older entry.",
          "",
        ].join("\n"),
      });
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "host",
        packageName: "@codemation/host",
        version: "1.2.3",
        changelog: [
          "# @codemation/host",
          "",
          "## 1.2.3",
          "",
          "### Patch Changes",
          "",
          "- Surface the new release metadata in the UI.",
          "",
        ].join("\n"),
      });
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "ignored",
        packageName: "@codemation/ignored",
        version: "9.9.9",
        changelog: [
          "# @codemation/ignored",
          "",
          "## 9.9.9",
          "",
          "### Patch Changes",
          "",
          "- This package should not be included.",
          "",
        ].join("\n"),
      });
      await mkdir(path.join(workspaceDirectory, "packages", "notes-only"), {
        recursive: true,
      });

      const builder = new GitHubReleaseNotesBuilder({
        rootDirectory: workspaceDirectory,
        repository: "MadeRelevant/codemation",
        version: "1.2.3",
        tag: "v1.2.3",
      });

      const releaseNotes = await builder.build();

      assert.match(releaseNotes, /# v1\.2\.3/);
      assert.match(releaseNotes, /## Published packages/);
      assert.match(releaseNotes, /`@codemation\/core`/);
      assert.match(releaseNotes, /`@codemation\/host`/);
      assert.doesNotMatch(releaseNotes, /@codemation\/ignored/);
      assert.match(releaseNotes, /## @codemation\/core/);
      assert.match(releaseNotes, /## @codemation\/host/);
      assert.match(releaseNotes, /Add PR links for release notes/);
      assert.match(releaseNotes, /Surface the new release metadata in the UI/);
      assert.doesNotMatch(releaseNotes, /Older entry/);
    } finally {
      await rm(workspaceDirectory, { recursive: true, force: true });
    }
  }

  async shouldAggregateNotesForPackagesChangedInHeadCommitEvenWhenVersionsDiffer() {
    const workspaceDirectory = await this.#createWorkspaceDirectory();

    try {
      await this.#initializeGitRepository(workspaceDirectory);
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "host",
        packageName: "@codemation/host",
        version: "0.2.0",
        changelog: ["# @codemation/host", "", "## 0.2.0", "", "### Patch Changes", "", "- Older host entry.", ""].join(
          "\n",
        ),
      });
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "next-host",
        packageName: "@codemation/next-host",
        version: "0.1.8",
        changelog: [
          "# @codemation/next-host",
          "",
          "## 0.1.8",
          "",
          "### Patch Changes",
          "",
          "- Older next-host entry.",
          "",
        ].join("\n"),
      });
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "ignored",
        packageName: "@codemation/ignored",
        version: "9.9.9",
        changelog: [
          "# @codemation/ignored",
          "",
          "## 9.9.9",
          "",
          "### Patch Changes",
          "",
          "- This package should not be included.",
          "",
        ].join("\n"),
      });
      await this.#commitAll(workspaceDirectory, "initial packages");

      await this.#writePackage({
        workspaceDirectory,
        directoryName: "host",
        packageName: "@codemation/host",
        version: "0.2.1",
        changelog: [
          "# @codemation/host",
          "",
          "## 0.2.1",
          "",
          "### Patch Changes",
          "",
          "- Publish host fixes.",
          "",
          "## 0.2.0",
          "",
          "### Patch Changes",
          "",
          "- Older host entry.",
          "",
        ].join("\n"),
      });
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "next-host",
        packageName: "@codemation/next-host",
        version: "0.1.9",
        changelog: [
          "# @codemation/next-host",
          "",
          "## 0.1.9",
          "",
          "### Patch Changes",
          "",
          "- Publish next-host fixes.",
          "",
          "## 0.1.8",
          "",
          "### Patch Changes",
          "",
          "- Older next-host entry.",
          "",
        ].join("\n"),
      });
      await this.#commitAll(workspaceDirectory, "release packages");

      const builder = new GitHubReleaseNotesBuilder({
        rootDirectory: workspaceDirectory,
        repository: "MadeRelevant/codemation",
        tag: "v0.5.1",
      });

      const releaseNotes = await builder.build();

      assert.match(releaseNotes, /# v0\.5\.1/);
      assert.match(releaseNotes, /`@codemation\/host`/);
      assert.match(releaseNotes, /`@codemation\/next-host`/);
      assert.doesNotMatch(releaseNotes, /@codemation\/ignored/);
      assert.match(releaseNotes, /Publish host fixes/);
      assert.match(releaseNotes, /Publish next-host fixes/);
      assert.doesNotMatch(releaseNotes, /Older host entry/);
      assert.doesNotMatch(releaseNotes, /Older next-host entry/);
    } finally {
      await rm(workspaceDirectory, { recursive: true, force: true });
    }
  }

  async shouldIgnoreInheritedGitEnvironmentWhenReadingChangedPackageReleaseNotes() {
    const workspaceDirectory = await this.#createWorkspaceDirectory();

    try {
      await this.#withTemporaryGitEnvironment(
        {
          GIT_DIR: path.join(workspaceDirectory, "outer.git"),
          GIT_WORK_TREE: path.join(workspaceDirectory, "outer-worktree"),
          GIT_INDEX_FILE: path.join(workspaceDirectory, "outer.index"),
          GIT_OBJECT_DIRECTORY: path.join(workspaceDirectory, "outer-objects"),
          GIT_ALTERNATE_OBJECT_DIRECTORIES: path.join(workspaceDirectory, "alternate-objects"),
          GIT_COMMON_DIR: path.join(workspaceDirectory, "outer-common"),
          GIT_PREFIX: "hooks/",
        },
        async () => {
          await this.#initializeGitRepository(workspaceDirectory);
          await this.#writePackage({
            workspaceDirectory,
            directoryName: "host",
            packageName: "@codemation/host",
            version: "0.2.0",
            changelog: [
              "# @codemation/host",
              "",
              "## 0.2.0",
              "",
              "### Patch Changes",
              "",
              "- Older host entry.",
              "",
            ].join("\n"),
          });
          await this.#commitAll(workspaceDirectory, "initial packages");
          await this.#writePackage({
            workspaceDirectory,
            directoryName: "host",
            packageName: "@codemation/host",
            version: "0.2.1",
            changelog: [
              "# @codemation/host",
              "",
              "## 0.2.1",
              "",
              "### Patch Changes",
              "",
              "- Publish host fixes.",
              "",
              "## 0.2.0",
              "",
              "### Patch Changes",
              "",
              "- Older host entry.",
              "",
            ].join("\n"),
          });
          await this.#commitAll(workspaceDirectory, "release packages");

          const builder = new GitHubReleaseNotesBuilder({
            rootDirectory: workspaceDirectory,
            repository: "MadeRelevant/codemation",
            tag: "v0.5.1",
            runtimeProcess: this.runtimeProcess,
          });

          const releaseNotes = await builder.build();

          assert.match(releaseNotes, /Publish host fixes/);
          assert.doesNotMatch(releaseNotes, /Older host entry/);
        },
      );
    } finally {
      await rm(workspaceDirectory, { recursive: true, force: true });
    }
  }

  async shouldFailWhenNoPackageHasReleaseNotes() {
    const workspaceDirectory = await this.#createWorkspaceDirectory();

    try {
      await this.#writePackage({
        workspaceDirectory,
        directoryName: "core",
        packageName: "@codemation/core",
        version: "1.2.3",
        changelog: "# @codemation/core\n",
      });

      const builder = new GitHubReleaseNotesBuilder({
        rootDirectory: workspaceDirectory,
        repository: "MadeRelevant/codemation",
        version: "1.2.3",
        tag: "v1.2.3",
      });

      await assert.rejects(builder.build(), /No package changelog sections were found for version 1\.2\.3/);
    } finally {
      await rm(workspaceDirectory, { recursive: true, force: true });
    }
  }

  async #createWorkspaceDirectory() {
    return mkdtemp(path.join(os.tmpdir(), "codemation-release-notes-"));
  }

  async #initializeGitRepository(workspaceDirectory) {
    await this.#runGitCommand(workspaceDirectory, ["init"]);
    await this.#runGitCommand(workspaceDirectory, ["config", "user.name", "Codemation Tests"]);
    await this.#runGitCommand(workspaceDirectory, ["config", "user.email", "tests@codemation.local"]);
  }

  async #commitAll(workspaceDirectory, message) {
    await this.#runGitCommand(workspaceDirectory, ["add", "."]);
    await this.#runGitCommand(workspaceDirectory, ["commit", "-m", message]);
  }

  async #writePackage({ workspaceDirectory, directoryName, packageName, version, changelog }) {
    const packageDirectory = path.join(workspaceDirectory, "packages", directoryName);

    await mkdir(packageDirectory, { recursive: true });
    await writeFile(
      path.join(packageDirectory, "package.json"),
      JSON.stringify({ name: packageName, version }, null, 2),
      "utf8",
    );
    await writeFile(path.join(packageDirectory, "CHANGELOG.md"), changelog, "utf8");
  }

  async #runGitCommand(workspaceDirectory, args) {
    await this.execFileAsync("git", args, {
      cwd: workspaceDirectory,
      env: this.#createIsolatedGitEnvironment(),
    });
  }

  #createIsolatedGitEnvironment() {
    const environment = { ...this.runtimeProcess.env };

    for (const variableName of Object.keys(environment)) {
      if (variableName.startsWith("GIT_")) {
        delete environment[variableName];
      }
    }

    return environment;
  }

  async #withTemporaryGitEnvironment(overrides, callback) {
    const originalValues = new Map();

    for (const [variableName, value] of Object.entries(overrides)) {
      originalValues.set(variableName, this.runtimeProcess.env[variableName]);
      this.runtimeProcess.env[variableName] = value;
    }

    try {
      await callback();
    } finally {
      for (const [variableName, value] of originalValues.entries()) {
        if (value === undefined) {
          delete this.runtimeProcess.env[variableName];
          continue;
        }

        this.runtimeProcess.env[variableName] = value;
      }
    }
  }
}

const gitHubReleaseNotesBuilderTest = new GitHubReleaseNotesBuilderTest(process);

test(
  "aggregates all matching package changelog sections",
  gitHubReleaseNotesBuilderTest.shouldAggregateChangedPackages.bind(gitHubReleaseNotesBuilderTest),
);

test(
  "fails when the tagged version has no matching changelog sections",
  gitHubReleaseNotesBuilderTest.shouldFailWhenNoPackageHasReleaseNotes.bind(gitHubReleaseNotesBuilderTest),
);

test(
  "aggregates changed package notes even when package versions differ",
  gitHubReleaseNotesBuilderTest.shouldAggregateNotesForPackagesChangedInHeadCommitEvenWhenVersionsDiffer.bind(
    gitHubReleaseNotesBuilderTest,
  ),
);

test(
  "ignores inherited git environment when reading changed package release notes",
  gitHubReleaseNotesBuilderTest.shouldIgnoreInheritedGitEnvironmentWhenReadingChangedPackageReleaseNotes.bind(
    gitHubReleaseNotesBuilderTest,
  ),
);
