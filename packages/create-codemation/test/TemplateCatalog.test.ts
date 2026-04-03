import { describe, expect, it } from "vitest";

import { NodeFileSystem } from "../src/NodeFileSystem";
import { TemplateCatalog } from "../src/TemplateCatalog";
import { TemplateDirectoryResolver } from "../src/TemplateDirectoryResolver";

describe("TemplateCatalog", () => {
  it("lists default and plugin templates", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const catalog = new TemplateCatalog(resolver, new NodeFileSystem());
    const ids = await catalog.listTemplateIds();
    expect(ids).toContain("default");
    expect(ids).toContain("plugin");
  });

  it("throws a helpful error for unknown templates", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const catalog = new TemplateCatalog(resolver, new NodeFileSystem());
    await expect(catalog.assertTemplateExists("does-not-exist")).rejects.toThrow(/Unknown template/);
  });
});
