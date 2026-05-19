import path from "node:path";
import { describe, expect, it } from "vitest";

import { NodeFileSystem } from "../src/NodeFileSystem";
import { TemplateCatalog } from "../src/TemplateCatalog";
import { TemplateDirectoryResolver } from "../src/TemplateDirectoryResolver";
import type { FileSystemPort } from "../src/FileSystemPort";

/** Minimal stub for FileSystemPort — fill only methods TemplateCatalog needs. */
function makeFakeFs(overrides: Partial<FileSystemPort>): FileSystemPort {
  return {
    mkdir: async () => undefined,
    cp: async () => undefined,
    readdir: async () => [],
    readFile: async () => "",
    writeFile: async () => undefined,
    stat: async () => ({ isDirectory: () => false }),
    ...overrides,
  };
}

const fakeResolver = {
  resolveTemplatesRoot: () => "/fake/templates",
  resolveTemplateDirectory: (id: string) => path.join("/fake/templates", id),
} as unknown as TemplateDirectoryResolver;

describe("TemplateCatalog", () => {
  it("lists default, managed, and plugin templates", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const catalog = new TemplateCatalog(resolver, new NodeFileSystem());
    const ids = await catalog.listTemplateIds();
    expect(ids).toContain("default");
    expect(ids).toContain("managed");
    expect(ids).toContain("plugin");
  });

  it("skips entries starting with '.'", async () => {
    const fakeStat = { isDirectory: () => true };
    const fakeFs = makeFakeFs({
      readdir: async () => [".hidden", "visible"],
      stat: async (p: string) => {
        if (p.endsWith(".hidden")) throw new Error("should not stat hidden");
        return fakeStat;
      },
    });
    const catalog = new TemplateCatalog(fakeResolver, fakeFs);
    const ids = await catalog.listTemplateIds();
    expect(ids).toEqual(["visible"]);
  });

  it("throws when template exists but is not a directory", async () => {
    const fakeFs = makeFakeFs({ stat: async () => ({ isDirectory: () => false }) });
    const catalog = new TemplateCatalog(fakeResolver, fakeFs);
    await expect(catalog.assertTemplateExists("my-tpl")).rejects.toThrow(/not a directory/);
  });

  it("rethrows non-ENOENT errors from stat", async () => {
    const fakeFs = makeFakeFs({
      stat: async () => {
        const err = Object.assign(new Error("EPERM"), { code: "EPERM" });
        throw err;
      },
    });
    const catalog = new TemplateCatalog(fakeResolver, fakeFs);
    await expect(catalog.assertTemplateExists("any")).rejects.toThrow("EPERM");
  });

  it("rethrows errors whose code is not a string (readNodeErrorCode returns undefined for numeric code)", async () => {
    // An error with a numeric .code exercises the typeof-string check (line 57 false branch).
    // readNodeErrorCode returns undefined → !== "ENOENT" → error is rethrown.
    const fakeFs = makeFakeFs({
      stat: async () => {
        const err = Object.assign(new Error("numeric-code"), { code: 42 });
        throw err;
      },
    });
    const catalog = new TemplateCatalog(fakeResolver, fakeFs);
    await expect(catalog.assertTemplateExists("any")).rejects.toThrow("numeric-code");
  });

  it("rethrows non-object errors (readNodeErrorCode returns undefined for null-ish error)", async () => {
    // When the caught error is null, readNodeErrorCode's outer if check fails → line 59 executes.
    // null !== "ENOENT" → error is rethrown.
    const fakeFs = makeFakeFs({
      stat: async () => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error
        throw null;
      },
    });
    const catalog = new TemplateCatalog(fakeResolver, fakeFs);
    // null is rethrown as-is since readNodeErrorCode(null) = undefined ≠ "ENOENT"
    await expect(catalog.assertTemplateExists("any")).rejects.toBeNull();
  });

  it("throws a helpful error for unknown templates", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const catalog = new TemplateCatalog(resolver, new NodeFileSystem());
    await expect(catalog.assertTemplateExists("does-not-exist")).rejects.toThrow(/Unknown template/);
  });
});
