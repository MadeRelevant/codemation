import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ConsumerProjectScaffolder } from "../src/ConsumerProjectScaffolder";
import { NodeFileSystem } from "../src/NodeFileSystem";
import { ProjectNameSanitizer } from "../src/ProjectNameSanitizer";
import { TemplateCatalog } from "../src/TemplateCatalog";
import { TemplateDirectoryResolver } from "../src/TemplateDirectoryResolver";

describe("ConsumerProjectScaffolder", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("copies the default template and rewrites package.json name", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const scaffolder = new ConsumerProjectScaffolder(resolver, templateCatalog, new ProjectNameSanitizer(), nodeFs);
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "create-codemation-"));
    tmpDirs.push(target);
    const projectDir = path.join(target, "my-cool-app");
    await scaffolder.scaffold({ templateId: "default", targetDirectory: projectDir, force: false });
    const pkgRaw = await fs.readFile(path.join(projectDir, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { name: string };
    expect(pkg.name).toBe("my-cool-app");
    await expect(fs.readFile(path.join(projectDir, "codemation.config.ts"), "utf8")).resolves.toContain(
      "codemationHost",
    );
  });

  it("refuses non-empty targets without --force", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const scaffolder = new ConsumerProjectScaffolder(resolver, templateCatalog, new ProjectNameSanitizer(), nodeFs);
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "create-codemation-"));
    tmpDirs.push(target);
    await fs.writeFile(path.join(target, "README.md"), "occupied\n", "utf8");
    await expect(scaffolder.scaffold({ templateId: "minimal", targetDirectory: target, force: false })).rejects.toThrow(
      /not empty/,
    );
  });
});
