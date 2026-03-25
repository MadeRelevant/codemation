import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ProjectNameSanitizer } from "../src/ProjectNameSanitizer";

describe("ProjectNameSanitizer", () => {
  it("sanitizes a normal directory name", () => {
    const sanitizer = new ProjectNameSanitizer();
    expect(sanitizer.sanitizeFromTargetPath(path.join(os.tmpdir(), "My App"))).toBe("my-app");
  });

  it("falls back when the basename is empty after sanitization", () => {
    const sanitizer = new ProjectNameSanitizer();
    expect(sanitizer.sanitizeFromTargetPath(path.resolve("/tmp", "..."))).toBe("codemation-app");
  });
});
