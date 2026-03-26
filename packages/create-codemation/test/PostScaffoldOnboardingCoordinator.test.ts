import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { ChildProcessRunnerPort } from "../src/ChildProcessRunnerPort";
import { NodeFileSystem } from "../src/NodeFileSystem";
import { PostScaffoldOnboardingCoordinator } from "../src/PostScaffoldOnboardingCoordinator";
import type { InteractivePromptPort } from "../src/InteractivePromptPort";
import type { TextOutputPort } from "../src/TextOutputPort";

class MemoryStdout implements TextOutputPort {
  text = "";
  write(chunk: string): void {
    this.text += chunk;
  }
}

class ScriptedPrompts implements InteractivePromptPort {
  constructor(
    private readonly confirmResult: boolean,
    private readonly answers: ReadonlyArray<string>,
  ) {}
  private index = 0;
  async confirm(_message: string): Promise<boolean> {
    return this.confirmResult;
  }
  async question(_message: string): Promise<string> {
    const v = this.answers[this.index];
    this.index += 1;
    return v ?? "";
  }
}

class RecordingRunner implements ChildProcessRunnerPort {
  readonly calls: Array<{ command: string; args: string[]; cwd: string }> = [];
  async run(command: string, args: ReadonlyArray<string>, options: Readonly<{ cwd: string }>): Promise<void> {
    this.calls.push({ command, args: [...args], cwd: options.cwd });
  }
}

describe("PostScaffoldOnboardingCoordinator", () => {
  const tmpDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tmpDirs.splice(0)) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("prints manual steps when --no-interaction", async () => {
    const out = new MemoryStdout();
    const coordinator = new PostScaffoldOnboardingCoordinator(
      out,
      new ScriptedPrompts(false, []),
      new NodeFileSystem(),
      new RecordingRunner(),
      true,
    );
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "onb-"));
    tmpDirs.push(target);
    await coordinator.runAfterScaffold({ targetDirectory: target, noInteraction: true });
    expect(out.text).toContain("npm install");
    expect(out.text).toContain("db migrate");
    expect(out.text).toContain("user create");
  });

  it("runs npm install, migrate, and user create when prompts succeed", async () => {
    const out = new MemoryStdout();
    const runner = new RecordingRunner();
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "onb-"));
    tmpDirs.push(target);
    await fs.writeFile(path.join(target, ".env.example"), "DATABASE_URL=postgresql://old\n# x\n", "utf8");
    const coordinator = new PostScaffoldOnboardingCoordinator(
      out,
      new ScriptedPrompts(true, [
        "postgresql://u:p@127.0.0.1:5432/db",
        "admin@example.com",
        "longpassword",
        "longpassword",
      ]),
      new NodeFileSystem(),
      runner,
      true,
    );
    await coordinator.runAfterScaffold({ targetDirectory: target, noInteraction: false });
    const env = await fs.readFile(path.join(target, ".env"), "utf8");
    expect(env).toContain("postgresql://u:p@127.0.0.1:5432/db");
    expect(runner.calls.length).toBe(3);
    expect(runner.calls[0]?.command).toBe("npm");
    expect(runner.calls[0]?.args[0]).toBe("install");
    expect(runner.calls[1]?.args).toContain("migrate");
    expect(runner.calls[2]?.args).toContain("create");
    expect(runner.calls[2]?.args).toContain("admin@example.com");
  });

  it("skips setup when user declines the confirmation", async () => {
    const out = new MemoryStdout();
    const runner = new RecordingRunner();
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "onb-"));
    tmpDirs.push(target);
    const coordinator = new PostScaffoldOnboardingCoordinator(
      out,
      new ScriptedPrompts(false, []),
      new NodeFileSystem(),
      runner,
      true,
    );
    await coordinator.runAfterScaffold({ targetDirectory: target, noInteraction: false });
    expect(runner.calls.length).toBe(0);
    expect(out.text).toContain("npm install");
  });
});
