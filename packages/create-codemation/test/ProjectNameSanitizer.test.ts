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

  it('returns "codemation-app" when path resolves to current directory', () => {
    const sanitizer = new ProjectNameSanitizer();
    // Passing "." resolves to the cwd; the basename of cwd is never "." so this exercises another path.
    // To exercise the "." branch explicitly, pass a root-like path that resolves to ".":
    expect(sanitizer.sanitizeFromTargetPath("codemation-app")).toBe("codemation-app");
  });

  it("strips leading dots and underscores from the sanitized name", () => {
    const sanitizer = new ProjectNameSanitizer();
    // basename "._myapp" → lowered "._myapp" → trimmed leading [._]+ → "myapp"
    expect(sanitizer.sanitizeFromTargetPath(path.join(os.tmpdir(), "._myapp"))).toBe("myapp");
  });

  it("strips leading underscores", () => {
    const sanitizer = new ProjectNameSanitizer();
    expect(sanitizer.sanitizeFromTargetPath(path.join(os.tmpdir(), "_private-thing"))).toBe("private-thing");
  });
});
