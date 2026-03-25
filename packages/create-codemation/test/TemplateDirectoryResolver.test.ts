import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TemplateDirectoryResolver } from "../src/TemplateDirectoryResolver";

describe("TemplateDirectoryResolver", () => {
  it("resolves the package templates directory from this test file", () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const templatesRoot = resolver.resolveTemplatesRoot();
    expect(path.join(templatesRoot, "default", "package.json")).toBe(
      path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "templates", "default", "package.json"),
    );
  });
});
