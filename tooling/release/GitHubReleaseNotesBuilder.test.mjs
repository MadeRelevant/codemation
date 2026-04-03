import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { GitHubReleaseNotesBuilder } from "./GitHubReleaseNotesBuilder.mjs";

class GitHubReleaseNotesBuilderTest {
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
}

const gitHubReleaseNotesBuilderTest = new GitHubReleaseNotesBuilderTest();

test(
  "aggregates all matching package changelog sections",
  gitHubReleaseNotesBuilderTest.shouldAggregateChangedPackages.bind(gitHubReleaseNotesBuilderTest),
);

test(
  "fails when the tagged version has no matching changelog sections",
  gitHubReleaseNotesBuilderTest.shouldFailWhenNoPackageHasReleaseNotes.bind(gitHubReleaseNotesBuilderTest),
);
