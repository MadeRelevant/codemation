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
    const pkg = JSON.parse(pkgRaw) as { name: string; packageManager?: string };
    expect(pkg.name).toBe("my-cool-app");
    expect(pkg.packageManager).toBe("pnpm@10.13.1");
    const env = await fs.readFile(path.join(projectDir, ".env"), "utf8");
    expect(env).toContain(".codemation/pglite");
    expect(env).toContain("CODEMATION_CREDENTIALS_MASTER_KEY=codemation-local-dev-credentials-master-key");
    expect(env).toContain("AUTH_SECRET=codemation-local-dev-auth-secret");
    await expect(fs.readFile(path.join(projectDir, "codemation.config.ts"), "utf8")).resolves.toContain(
      "codemationHost",
    );
  });

  it("copies the minimal template with the expected starter workflow layout", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const scaffolder = new ConsumerProjectScaffolder(resolver, templateCatalog, new ProjectNameSanitizer(), nodeFs);
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "create-codemation-"));
    tmpDirs.push(target);
    const projectDir = path.join(target, "my-minimal-app");

    await scaffolder.scaffold({ templateId: "minimal", targetDirectory: projectDir, force: false });

    const pkgRaw = await fs.readFile(path.join(projectDir, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { name: string; packageManager?: string; dependencies?: Record<string, string> };
    expect(pkg.name).toBe("my-minimal-app");
    expect(pkg.packageManager).toBe("pnpm@10.13.1");
    expect(pkg.dependencies?.["@codemation/cli"]).toBe("^0.0.15");
    const env = await fs.readFile(path.join(projectDir, ".env"), "utf8");
    expect(env).toContain("CODEMATION_CREDENTIALS_MASTER_KEY=codemation-local-dev-credentials-master-key");
    expect(env).toContain("AUTH_SECRET=codemation-local-dev-auth-secret");
    await expect(fs.readFile(path.join(projectDir, "codemation.config.ts"), "utf8")).resolves.toContain(
      'productName: "My automation"',
    );
    await expect(fs.readFile(path.join(projectDir, "src", "workflows", "hello.ts"), "utf8")).resolves.toContain(
      'id: "wf.minimal.hello"',
    );
  });

  it("overwrites matching template files when --force is set", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const scaffolder = new ConsumerProjectScaffolder(resolver, templateCatalog, new ProjectNameSanitizer(), nodeFs);
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "create-codemation-force-"));
    tmpDirs.push(projectDir);
    await fs.writeFile(path.join(projectDir, "README.md"), "occupied\n", "utf8");
    await fs.writeFile(path.join(projectDir, "package.json"), JSON.stringify({ name: "occupied" }), "utf8");

    await scaffolder.scaffold({ templateId: "default", targetDirectory: projectDir, force: true });

    await expect(fs.readFile(path.join(projectDir, "README.md"), "utf8")).resolves.toContain(
      "# Codemation starter (default template)",
    );
    const pkgRaw = await fs.readFile(path.join(projectDir, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { name: string };
    expect(pkg.name).toBe(path.basename(projectDir).toLowerCase());
  });

  it("preserves an existing .env file instead of replacing it from .env.example", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const scaffolder = new ConsumerProjectScaffolder(resolver, templateCatalog, new ProjectNameSanitizer(), nodeFs);
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "create-codemation-env-"));
    tmpDirs.push(projectDir);
    const existingEnv = "AUTH_SECRET=keep-me\n";
    await fs.writeFile(path.join(projectDir, ".env"), existingEnv, "utf8");

    await scaffolder.scaffold({ templateId: "minimal", targetDirectory: projectDir, force: false });

    await expect(fs.readFile(path.join(projectDir, ".env"), "utf8")).resolves.toBe(existingEnv);
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
