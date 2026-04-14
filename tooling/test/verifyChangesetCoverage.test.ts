import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

class VerifyChangesetCoverageHarness {
  private static readonly repoRoot = path.resolve(import.meta.dirname, "../..");
  private static readonly changesetDirectory = path.join(VerifyChangesetCoverageHarness.repoRoot, ".changeset");
  private static readonly scriptPath = path.join(
    VerifyChangesetCoverageHarness.repoRoot,
    "tooling/scripts/verify-changeset-coverage.sh",
  );

  private constructor(
    private readonly relativeChangesetPath: string,
    private readonly absoluteChangesetPath: string,
  ) {}

  static createWithContent(content: string): VerifyChangesetCoverageHarness {
    const filename = `verify-changeset-coverage-${randomUUID()}.md`;
    const relativeChangesetPath = path.posix.join(".changeset", filename);
    const absoluteChangesetPath = path.join(VerifyChangesetCoverageHarness.changesetDirectory, filename);
    writeFileSync(absoluteChangesetPath, content, "utf8");
    return new VerifyChangesetCoverageHarness(relativeChangesetPath, absoluteChangesetPath);
  }

  dispose(): void {
    if (existsSync(this.absoluteChangesetPath)) {
      unlinkSync(this.absoluteChangesetPath);
    }
  }

  run() {
    return spawnSync("sh", [VerifyChangesetCoverageHarness.scriptPath], {
      cwd: VerifyChangesetCoverageHarness.repoRoot,
      env: {
        ...process.env,
        CHANGESET_VERIFY_CHANGED_FILES: this.relativeChangesetPath,
      },
      encoding: "utf8",
    });
  }

  runWithChangedFiles(changedFiles: string) {
    return spawnSync("sh", [VerifyChangesetCoverageHarness.scriptPath], {
      cwd: VerifyChangesetCoverageHarness.repoRoot,
      env: {
        ...process.env,
        CHANGESET_VERIFY_CHANGED_FILES: changedFiles,
      },
      encoding: "utf8",
    });
  }

  getRelativeChangesetPath(): string {
    return this.relativeChangesetPath;
  }
}

describe("verify-changeset-coverage.sh", () => {
  it("rejects malformed changed changesets before coverage checks", () => {
    const harness = VerifyChangesetCoverageHarness.createWithContent(
      ['"@codemation/next-host": patch', "", "---", "", "Malformed changeset regression fixture.", ""].join("\n"),
    );
    try {
      const result = harness.run();
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(
        "changeset-verify: changed .changeset/*.md files must be parseable by Changesets.",
      );
      expect(result.stdout).toContain(harness.getRelativeChangesetPath());
    } finally {
      harness.dispose();
    }
  });

  it("accepts parseable changed changesets", () => {
    const harness = VerifyChangesetCoverageHarness.createWithContent(
      ["---", '"@codemation/next-host": patch', "---", "", "Valid changeset fixture.", ""].join("\n"),
    );
    try {
      const result = harness.run();
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    } finally {
      harness.dispose();
    }
  });

  it("accepts deleted changeset files during version-package commits", () => {
    const harness = VerifyChangesetCoverageHarness.createWithContent(
      ["---", '"@codemation/next-host": patch', "---", "", "Deleted changeset fixture.", ""].join("\n"),
    );
    try {
      harness.dispose();
      const result = harness.runWithChangedFiles(harness.getRelativeChangesetPath());
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    } finally {
      harness.dispose();
    }
  });

  it("ignores .changeset README entries when validating changed files", () => {
    const harness = VerifyChangesetCoverageHarness.createWithContent(
      ["---", '"@codemation/next-host": patch', "---", "", "Valid changeset fixture.", ""].join("\n"),
    );
    try {
      const result = harness.runWithChangedFiles(
        [".changeset/README.md", harness.getRelativeChangesetPath()].join("\n"),
      );
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
    } finally {
      harness.dispose();
    }
  });
});
