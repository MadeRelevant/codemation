import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ConsumerProjectScaffolder } from "../src/ConsumerProjectScaffolder";
import { CreateCodemationProgram } from "../src/CreateCodemationProgram";
import { NodeFileSystem } from "../src/NodeFileSystem";
import { ProjectNameSanitizer } from "../src/ProjectNameSanitizer";
import { TemplateCatalog } from "../src/TemplateCatalog";
import { TemplateDirectoryResolver } from "../src/TemplateDirectoryResolver";
import type { PostScaffoldOnboardingPort } from "../src/PostScaffoldOnboardingPort";
import type { TextOutputPort } from "../src/TextOutputPort";

class MemoryStdout implements TextOutputPort {
  text = "";
  write(chunk: string): void {
    this.text += chunk;
  }
}

class NoopOnboarding implements PostScaffoldOnboardingPort {
  async runAfterScaffold(): Promise<void> {}
}

class RecordingOnboarding implements PostScaffoldOnboardingPort {
  last: { targetDirectory: string; noInteraction: boolean } | undefined;
  async runAfterScaffold(args: Readonly<{ targetDirectory: string; noInteraction: boolean }>): Promise<void> {
    this.last = args;
  }
}

describe("CreateCodemationProgram", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("prints template ids with --list-templates", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const scaffolder = new ConsumerProjectScaffolder(resolver, templateCatalog, new ProjectNameSanitizer(), nodeFs);
    const memory = new MemoryStdout();
    const program = new CreateCodemationProgram(scaffolder, templateCatalog, memory, new NoopOnboarding());
    await program.run(["--list-templates"]);
    expect(memory.text).toContain("default");
    expect(memory.text).toContain("minimal");
  });

  it("passes noInteraction to onboarding when --non-interactive is set", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const scaffolder = new ConsumerProjectScaffolder(resolver, templateCatalog, new ProjectNameSanitizer(), nodeFs);
    const memory = new MemoryStdout();
    const onboarding = new RecordingOnboarding();
    const program = new CreateCodemationProgram(scaffolder, templateCatalog, memory, onboarding);
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "create-codemation-prog-"));
    tmpDirs.push(target);
    const appDir = path.join(target, "ci-app");
    await program.run(["--non-interactive", "--template", "minimal", appDir]);
    expect(onboarding.last?.noInteraction).toBe(true);
    expect(onboarding.last?.targetDirectory).toBe(appDir);
  });

  it("passes noInteraction when argv contains --no-interaction (npm create parity)", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const scaffolder = new ConsumerProjectScaffolder(resolver, templateCatalog, new ProjectNameSanitizer(), nodeFs);
    const memory = new MemoryStdout();
    const onboarding = new RecordingOnboarding();
    const program = new CreateCodemationProgram(scaffolder, templateCatalog, memory, onboarding);
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "create-codemation-prog-"));
    tmpDirs.push(target);
    const appDir = path.join(target, "npm-create-app");
    await program.run(["--no-interaction", "--template", "minimal", appDir]);
    expect(onboarding.last?.noInteraction).toBe(true);
  });
});
