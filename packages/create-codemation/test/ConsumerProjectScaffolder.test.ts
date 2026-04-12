import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { AgentSkillsDirectoryResolver } from "../src/AgentSkillsDirectoryResolver";
import { ConsumerProjectScaffolder } from "../src/ConsumerProjectScaffolder";
import { NodeFileSystem } from "../src/NodeFileSystem";
import { ProjectNameSanitizer } from "../src/ProjectNameSanitizer";
import { TemplateCatalog } from "../src/TemplateCatalog";
import { TemplateDirectoryResolver } from "../src/TemplateDirectoryResolver";

describe("ConsumerProjectScaffolder", () => {
  const tmpDirs: string[] = [];
  const agentSkillsDirectoryResolver = new AgentSkillsDirectoryResolver(import.meta.url);

  afterEach(async () => {
    for (const dir of tmpDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("copies the default template and rewrites package.json name", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const scaffolder = new ConsumerProjectScaffolder(
      resolver,
      agentSkillsDirectoryResolver,
      templateCatalog,
      new ProjectNameSanitizer(),
      nodeFs,
    );
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "create-codemation-"));
    tmpDirs.push(target);
    const projectDir = path.join(target, "my-cool-app");
    await scaffolder.scaffold({ templateId: "default", targetDirectory: projectDir, force: false });
    const pkgRaw = await fs.readFile(path.join(projectDir, "package.json"), "utf8");
    const pkg = JSON.parse(pkgRaw) as { name: string; packageManager?: string };
    expect(pkg.name).toBe("my-cool-app");
    expect(pkg.packageManager).toBe("pnpm@10.13.1");
    const env = await fs.readFile(path.join(projectDir, ".env"), "utf8");
    expect(env).toContain(".codemation/codemation.sqlite");
    expect(env).toContain("CODEMATION_CREDENTIALS_MASTER_KEY=codemation-local-dev-credentials-master-key");
    expect(env).toContain("AUTH_SECRET=codemation-local-dev-auth-secret");
    await expect(fs.readFile(path.join(projectDir, "codemation.config.ts"), "utf8")).resolves.toContain(
      "codemationHost",
    );
    await expect(fs.readFile(path.join(projectDir, "AGENTS.md"), "utf8")).resolves.toContain(
      "Before making substantive changes, read the relevant Codemation skills first.",
    );
    await expect(
      fs.readFile(path.join(projectDir, ".agents", "skills", "extracted", "codemation-cli", "SKILL.md"), "utf8"),
    ).resolves.toContain("name: codemation-cli");
  });

  it("copies the plugin template with the simplified plugin authoring surface", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const scaffolder = new ConsumerProjectScaffolder(
      resolver,
      agentSkillsDirectoryResolver,
      templateCatalog,
      new ProjectNameSanitizer(),
      nodeFs,
    );
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "create-codemation-plugin-"));
    tmpDirs.push(target);
    const projectDir = path.join(target, "my-plugin");

    await scaffolder.scaffold({ templateId: "plugin", targetDirectory: projectDir, force: false });

    const packageJson = JSON.parse(await fs.readFile(path.join(projectDir, "package.json"), "utf8")) as {
      main?: string;
      module?: string;
      types?: string;
      codemation?: { plugin?: string };
      exports?: Record<string, unknown>;
    };
    expect(packageJson.main).toBe("./dist/index.cjs");
    expect(packageJson.module).toBe("./dist/index.js");
    expect(packageJson.types).toBe("./dist/index.d.ts");
    expect(packageJson.codemation?.plugin).toBe("./dist/codemation.plugin.js");
    expect(packageJson.exports).toHaveProperty(".");

    const pluginEntry = await fs.readFile(path.join(projectDir, "codemation.plugin.ts"), "utf8");
    expect(pluginEntry).toContain("definePlugin");
    expect(pluginEntry).toContain("defineCodemationApp");
    expect(pluginEntry).toContain('workflow("wf.plugin.hello")');

    await expect(fs.readFile(path.join(projectDir, "tsdown.config.ts"), "utf8")).resolves.toContain(
      'index: "src/index.ts"',
    );

    const credentialFile = await fs.readFile(
      path.join(projectDir, "src", "credentialTypes", "ExampleApiKeyCredentialType.ts"),
      "utf8",
    );
    expect(credentialFile).toContain("defineCredential");

    const nodeFile = await fs.readFile(path.join(projectDir, "src", "nodes", "ExamplePluginUppercase.ts"), "utf8");
    expect(nodeFile).toContain("defineNode");
    await expect(fs.readFile(path.join(projectDir, "src", "index.ts"), "utf8")).resolves.toContain(
      'export * from "./nodes/ExamplePluginUppercase";',
    );
    await expect(fs.readFile(path.join(projectDir, "AGENTS.md"), "utf8")).resolves.toContain(
      "codemation-plugin-development",
    );
    await expect(
      fs.readFile(
        path.join(projectDir, ".agents", "skills", "extracted", "codemation-plugin-development", "SKILL.md"),
        "utf8",
      ),
    ).resolves.toContain("name: codemation-plugin-development");
  });

  it("overwrites matching template files when --force is set", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const scaffolder = new ConsumerProjectScaffolder(
      resolver,
      agentSkillsDirectoryResolver,
      templateCatalog,
      new ProjectNameSanitizer(),
      nodeFs,
    );
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
    const scaffolder = new ConsumerProjectScaffolder(
      resolver,
      agentSkillsDirectoryResolver,
      templateCatalog,
      new ProjectNameSanitizer(),
      nodeFs,
    );
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "create-codemation-env-"));
    tmpDirs.push(projectDir);
    const existingEnv = "AUTH_SECRET=keep-me\n";
    await fs.writeFile(path.join(projectDir, ".env"), existingEnv, "utf8");

    await scaffolder.scaffold({ templateId: "default", targetDirectory: projectDir, force: false });

    await expect(fs.readFile(path.join(projectDir, ".env"), "utf8")).resolves.toBe(existingEnv);
  });

  it("refuses non-empty targets without --force", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const scaffolder = new ConsumerProjectScaffolder(
      resolver,
      agentSkillsDirectoryResolver,
      templateCatalog,
      new ProjectNameSanitizer(),
      nodeFs,
    );
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "create-codemation-"));
    tmpDirs.push(target);
    await fs.writeFile(path.join(target, "README.md"), "occupied\n", "utf8");
    await expect(scaffolder.scaffold({ templateId: "default", targetDirectory: target, force: false })).rejects.toThrow(
      /not empty/,
    );
  });
});
