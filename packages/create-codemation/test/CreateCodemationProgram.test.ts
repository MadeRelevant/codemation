import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

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
  last:
    | {
        templateId: string;
        targetDirectory: string;
        noInteraction: boolean;
        adminUser?: Readonly<{ email: string; password: string }>;
      }
    | undefined;
  async runAfterScaffold(
    args: Readonly<{
      templateId: string;
      targetDirectory: string;
      noInteraction: boolean;
      adminUser?: Readonly<{ email: string; password: string }>;
    }>,
  ): Promise<void> {
    this.last = args;
  }
}

class RecordingScaffolder {
  last:
    | Readonly<{
        templateId: string;
        targetDirectory: string;
        force: boolean;
      }>
    | undefined;

  async scaffold(args: Readonly<{ templateId: string; targetDirectory: string; force: boolean }>): Promise<void> {
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

  it("forwards non-interactive admin credentials to onboarding", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const scaffolder = new ConsumerProjectScaffolder(resolver, templateCatalog, new ProjectNameSanitizer(), nodeFs);
    const memory = new MemoryStdout();
    const onboarding = new RecordingOnboarding();
    const program = new CreateCodemationProgram(scaffolder, templateCatalog, memory, onboarding);
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "create-codemation-prog-"));
    tmpDirs.push(target);
    const appDir = path.join(target, "ci-auth-app");

    await program.run([
      "--yes",
      "--template",
      "minimal",
      "--admin-email",
      "admin@example.com",
      "--admin-password",
      "longpassword",
      appDir,
    ]);

    expect(onboarding.last).toEqual({
      templateId: "minimal",
      targetDirectory: appDir,
      noInteraction: true,
      adminUser: {
        email: "admin@example.com",
        password: "longpassword",
      },
    });
  });

  it("defaults the target directory to codemation-app in the current working directory", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const memory = new MemoryStdout();
    const onboarding = new RecordingOnboarding();
    const scaffolder = new RecordingScaffolder();
    const program = new CreateCodemationProgram(scaffolder as never, templateCatalog, memory, onboarding);
    const workingDirectory = await fs.mkdtemp(path.join(os.tmpdir(), "create-codemation-cwd-"));
    tmpDirs.push(workingDirectory);
    const mutableProcess = process as NodeJS.Process & { cwd: () => string };
    const originalCwd = mutableProcess.cwd;

    try {
      mutableProcess.cwd = () => workingDirectory;
      await program.run([]);
    } finally {
      mutableProcess.cwd = originalCwd;
    }

    expect(scaffolder.last?.targetDirectory).toBe(path.join(workingDirectory, "codemation-app"));
    expect(scaffolder.last?.templateId).toBe("default");
    expect(onboarding.last?.targetDirectory).toBe(path.join(workingDirectory, "codemation-app"));
    expect(onboarding.last?.noInteraction).toBe(false);
  });

  it("forwards --force to the scaffolder", async () => {
    const resolver = new TemplateDirectoryResolver(import.meta.url);
    const nodeFs = new NodeFileSystem();
    const templateCatalog = new TemplateCatalog(resolver, nodeFs);
    const memory = new MemoryStdout();
    const onboarding = new RecordingOnboarding();
    const scaffolder = new RecordingScaffolder();
    const program = new CreateCodemationProgram(scaffolder as never, templateCatalog, memory, onboarding);

    await program.run(["--force", "--template", "minimal", "forced-app"]);

    expect(scaffolder.last).toEqual({
      templateId: "minimal",
      targetDirectory: path.resolve("forced-app"),
      force: true,
    });
  });
});
