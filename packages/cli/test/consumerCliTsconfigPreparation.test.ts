import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ConsumerCliTsconfigPreparation } from "../src/consumer/ConsumerCliTsconfigPreparation";

describe("ConsumerCliTsconfigPreparation", () => {
  let tmpDir: string;
  let originalEnvValue: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), "codemation-tsconfig-prep-"));
    originalEnvValue = process.env["CODEMATION_TSCONFIG_PATH"];
    delete process.env["CODEMATION_TSCONFIG_PATH"];
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    if (originalEnvValue !== undefined) {
      process.env["CODEMATION_TSCONFIG_PATH"] = originalEnvValue;
    } else {
      delete process.env["CODEMATION_TSCONFIG_PATH"];
    }
  });

  it("does nothing when CODEMATION_TSCONFIG_PATH is already set", () => {
    process.env["CODEMATION_TSCONFIG_PATH"] = "/some/pre-existing/tsconfig.json";
    const prep = new ConsumerCliTsconfigPreparation();
    prep.applyWorkspaceTsconfigForTsxIfPresent(tmpDir);
    expect(process.env["CODEMATION_TSCONFIG_PATH"]).toBe("/some/pre-existing/tsconfig.json");
  });

  it("does nothing when CODEMATION_TSCONFIG_PATH is set to whitespace only", () => {
    process.env["CODEMATION_TSCONFIG_PATH"] = "   ";
    const prep = new ConsumerCliTsconfigPreparation();
    prep.applyWorkspaceTsconfigForTsxIfPresent(tmpDir);
    // Should return early — value unchanged
    expect(process.env["CODEMATION_TSCONFIG_PATH"]).toBe("   ");
  });

  it("sets CODEMATION_TSCONFIG_PATH when tsconfig.codemation-tsx.json exists in consumerRoot", () => {
    const tsconfigPath = path.join(tmpDir, "tsconfig.codemation-tsx.json");
    writeFileSync(tsconfigPath, "{}");

    const prep = new ConsumerCliTsconfigPreparation();
    prep.applyWorkspaceTsconfigForTsxIfPresent(tmpDir);

    expect(process.env["CODEMATION_TSCONFIG_PATH"]).toBe(tsconfigPath);
  });

  it("sets CODEMATION_TSCONFIG_PATH when tsconfig.codemation-tsx.json exists one level up", () => {
    // Parent of tmpDir contains the file
    const parentDir = path.dirname(tmpDir);
    const tsconfigPath = path.join(parentDir, "tsconfig.codemation-tsx.json");
    let cleanup = false;
    try {
      writeFileSync(tsconfigPath, "{}");
      cleanup = true;

      // Use a subdirectory as the consumerRoot
      const subDir = path.join(tmpDir, "sub");
      mkdirSync(subDir, { recursive: true });

      const prep = new ConsumerCliTsconfigPreparation();
      prep.applyWorkspaceTsconfigForTsxIfPresent(subDir);

      expect(process.env["CODEMATION_TSCONFIG_PATH"]).toBe(tsconfigPath);
    } finally {
      if (cleanup) {
        try {
          rmSync(tsconfigPath, { force: true });
        } catch {
          // ignore
        }
      }
    }
  });

  it("leaves CODEMATION_TSCONFIG_PATH unset when no tsconfig.codemation-tsx.json is found", () => {
    // tmpDir exists but no tsconfig file in it or its ancestors (within the 3-level check)
    const deepDir = path.join(tmpDir, "a", "b", "c");
    mkdirSync(deepDir, { recursive: true });

    const prep = new ConsumerCliTsconfigPreparation();
    // Use a deep path where none of the 3 candidate levels contains the file
    prep.applyWorkspaceTsconfigForTsxIfPresent(deepDir);

    expect(process.env["CODEMATION_TSCONFIG_PATH"]).toBeUndefined();
  });
});
