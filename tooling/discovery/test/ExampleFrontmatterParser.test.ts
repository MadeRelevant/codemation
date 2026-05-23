import { describe, expect, it } from "vitest";
import { ExampleFrontmatterParser } from "../ExampleFrontmatterParser.js";

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
});
