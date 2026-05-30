import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ExampleFrontmatterParser } from "../ExampleFrontmatterParser.js";

/** Minimal temp directory fixture for testing filesystem-dependent resolution. */
class TempFixture {
  readonly dir: string;
  constructor() {
    this.dir = fs.mkdtempSync(path.join(os.tmpdir(), "efp-test-"));
  }
  writeFile(relPath: string, content: string): void {
    const full = path.join(this.dir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf8");
  }
  cleanup(): void {
    fs.rmSync(this.dir, { recursive: true, force: true });
  }
}

describe("ExampleFrontmatterParser", () => {
  const parser = new ExampleFrontmatterParser();
  const pkgDeps = {
    "@codemation/core-nodes-gmail": "^0.2.0",
    "@codemation/core-nodes": "^0.7.0",
  };

  it("parses file slug from path", () => {
    const result = parser.parse("src/examples/send-email.example.ts", "/** desc */\nexport const x = 1;", {});
    expect(result.name).toBe("send-email");
  });

  it("extracts description from JSDoc comment body", () => {
    const source = `
/**
 * Sends a Gmail message with attachments.
 * @tags gmail, email
 */
export const workflow = {};
    `.trim();

    const result = parser.parse("src/examples/send.example.ts", source, {});
    expect(result.description).toContain("Sends a Gmail message");
  });

  it("extracts description from @description tag", () => {
    const source = `
/**
 * @description A workflow that sends emails.
 * @tags email
 */
export const x = 1;
    `.trim();

    const result = parser.parse("src/examples/e.example.ts", source, {});
    expect(result.description).toBe("A workflow that sends emails.");
  });

  it("extracts comma-separated tags", () => {
    const source = `
/**
 * Example workflow.
 * @tags gmail, email, trigger
 */
export const x = 1;
    `.trim();

    const result = parser.parse("src/examples/e.example.ts", source, {});
    expect(result.tags).toContain("gmail");
    expect(result.tags).toContain("email");
    expect(result.tags).toContain("trigger");
  });

  it("returns empty tags when @tags is missing", () => {
    const source = `
/**
 * Example workflow.
 */
export const x = 1;
    `.trim();

    const result = parser.parse("src/examples/e.example.ts", source, {});
    expect(result.tags).toEqual([]);
  });

  it("resolves @uses packages from packageDeps", () => {
    const source = `
/**
 * Gmail workflow.
 * @tags gmail
 * @uses @codemation/core-nodes-gmail, @codemation/core-nodes
 */
export const x = 1;
    `.trim();

    const result = parser.parse("src/examples/e.example.ts", source, pkgDeps);
    expect(result.dependencies["@codemation/core-nodes-gmail"]).toBe("^0.2.0");
    expect(result.dependencies["@codemation/core-nodes"]).toBe("^0.7.0");
  });

  it("ignores @uses packages not in packageDeps", () => {
    const source = `
/**
 * Workflow.
 * @uses @codemation/unknown-pkg
 */
export const x = 1;
    `.trim();

    const result = parser.parse("src/examples/e.example.ts", source, pkgDeps);
    expect(Object.keys(result.dependencies)).toHaveLength(0);
  });

  it("includes full source code", () => {
    const source = "/** Example. */\nexport const myWorkflow = { trigger: 'webhook' };";
    const result = parser.parse("src/examples/e.example.ts", source, {});
    expect(result.code).toBe(source);
  });

  it("returns empty description when no JSDoc present", () => {
    const source = "export const x = 1;";
    const result = parser.parse("src/examples/e.example.ts", source, {});
    expect(result.description).toBe("");
    expect(result.tags).toEqual([]);
  });

  it("sets sourcePath to the provided filePath", () => {
    const filePath = "src/examples/my-flow.example.ts";
    const result = parser.parse(filePath, "/** desc */\nexport const x = 1;", {});
    expect(result.sourcePath).toBe(filePath);
  });

  describe("version resolution (Story 01)", () => {
    let fixture: TempFixture;
    beforeEach(() => {
      fixture = new TempFixture();
    });
    afterEach(() => {
      fixture.cleanup();
    });

    it("resolves workspace:* specifier to concrete version from node_modules", () => {
      // Arrange: packageRoot has node_modules/@codemation/core-nodes/package.json
      fixture.writeFile(
        "node_modules/@codemation/core-nodes/package.json",
        JSON.stringify({ name: "@codemation/core-nodes", version: "1.3.0" }),
      );
      const deps = { "@codemation/core-nodes": "workspace:*" };
      const source = `
/**
 * Example.
 * @uses @codemation/core-nodes
 */
export const x = 1;
      `.trim();

      const result = parser.parse("src/examples/e.example.ts", source, deps, fixture.dir);
      expect(result.dependencies["@codemation/core-nodes"]).toBe("1.3.0");
    });

    it("resolves ^caret specifier to concrete installed version, not the range string", () => {
      fixture.writeFile(
        "node_modules/@codemation/core-nodes/package.json",
        JSON.stringify({ name: "@codemation/core-nodes", version: "1.5.2" }),
      );
      const deps = { "@codemation/core-nodes": "^1.2.0" };
      const source = `
/**
 * Example.
 * @uses @codemation/core-nodes
 */
export const x = 1;
      `.trim();

      const result = parser.parse("src/examples/e.example.ts", source, deps, fixture.dir);
      expect(result.dependencies["@codemation/core-nodes"]).toBe("1.5.2");
    });

    it("falls back to raw specifier when node_modules entry is missing", () => {
      // No node_modules set up — should fall back gracefully (D2).
      const deps = { "@codemation/core-nodes": "workspace:*" };
      const source = `
/**
 * Example.
 * @uses @codemation/core-nodes
 */
export const x = 1;
      `.trim();

      const result = parser.parse("src/examples/e.example.ts", source, deps, fixture.dir);
      expect(result.dependencies["@codemation/core-nodes"]).toBe("workspace:*");
    });

    it("produces empty dependencies for empty uses (D4 no-op)", () => {
      const source = `
/**
 * Framework-agnostic example.
 */
export const x = 1;
      `.trim();

      const result = parser.parse("src/examples/e.example.ts", source, {}, fixture.dir);
      expect(result.dependencies).toEqual({});
    });

    it("regression guard: resolved workspace:* yields a concrete semver version string, not workspace:* or a range", () => {
      fixture.writeFile(
        "node_modules/@codemation/core-nodes/package.json",
        JSON.stringify({ name: "@codemation/core-nodes", version: "1.3.0" }),
      );
      const deps = { "@codemation/core-nodes": "workspace:*" };
      const source = `
/**
 * Example.
 * @uses @codemation/core-nodes
 */
export const x = 1;
      `.trim();

      const result = parser.parse("src/examples/e.example.ts", source, deps, fixture.dir);
      const resolved = result.dependencies["@codemation/core-nodes"];
      // A concrete semver version: X.Y.Z (no workspace:, no ^, no >=)
      expect(resolved).toMatch(/^\d+\.\d+\.\d+/);
      expect(resolved).not.toContain("workspace:");
      expect(resolved).not.toMatch(/^[^0-9]/);
    });
  });
});
