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
  readonly confirmCalls: Array<{ message: string; defaultValue: boolean | undefined }> = [];
  readonly questionCalls: Array<{ message: string; maskInput: boolean }> = [];

  constructor(
    private readonly confirmResults: boolean | ReadonlyArray<boolean>,
    private readonly answers: ReadonlyArray<string>,
  ) {}
  private index = 0;
  private confirmIndex = 0;
  async confirm(message: string, options?: Readonly<{ defaultValue?: boolean }>): Promise<boolean> {
    this.confirmCalls.push({ message, defaultValue: options?.defaultValue });
    if (typeof this.confirmResults === "boolean") {
      return this.confirmResults;
    }
    const value = this.confirmResults[this.confirmIndex];
    this.confirmIndex += 1;
    return value ?? false;
  }
  async question(message: string, options?: Readonly<{ maskInput?: boolean }>): Promise<string> {
    this.questionCalls.push({ message, maskInput: options?.maskInput === true });
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
    await fs.writeFile(path.join(target, "package.json"), JSON.stringify({ packageManager: "pnpm@10.13.1" }), "utf8");
    await coordinator.runAfterScaffold({ targetDirectory: target, noInteraction: true });
    expect(out.text).toContain("pnpm install");
    expect(out.text).toContain("pnpm exec codemation db migrate");
    expect(out.text).toContain("pnpm dev");
    expect(out.text).toContain("db migrate");
    expect(out.text).toContain("user create");
    expect(out.text).toContain(".env is already created");
  });

  it("runs pnpm install, migrate, and user create when the template opts into pnpm", async () => {
    const out = new MemoryStdout();
    const runner = new RecordingRunner();
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "onb-"));
    tmpDirs.push(target);
    await fs.writeFile(path.join(target, "package.json"), JSON.stringify({ packageManager: "pnpm@10.13.1" }), "utf8");
    await fs.writeFile(path.join(target, ".env.example"), "# zero-setup defaults\n", "utf8");
    await fs.writeFile(
      path.join(target, "codemation.config.ts"),
      "export default { app: { auth: { allowUnauthenticatedInDevelopment: true } } };\n",
      "utf8",
    );
    const prompts = new ScriptedPrompts(true, ["admin@example.com", "longpassword", "longpassword"]);
    const coordinator = new PostScaffoldOnboardingCoordinator(out, prompts, new NodeFileSystem(), runner, true);
    await coordinator.runAfterScaffold({ targetDirectory: target, noInteraction: false });
    const env = await fs.readFile(path.join(target, ".env"), "utf8");
    const config = await fs.readFile(path.join(target, "codemation.config.ts"), "utf8");
    expect(env).toContain("# zero-setup defaults");
    expect(config).toContain("allowUnauthenticatedInDevelopment: false");
    expect(runner.calls).toEqual([
      { command: "pnpm", args: ["install"], cwd: target },
      { command: "pnpm", args: ["exec", "codemation", "db", "migrate"], cwd: target },
      {
        command: "pnpm",
        args: ["exec", "codemation", "user", "create", "--email", "admin@example.com", "--password", "longpassword"],
        cwd: target,
      },
    ]);
    expect(prompts.confirmCalls).toEqual([
      {
        message: "\nDo you want authentication enabled? It is recommended and enabled by default.",
        defaultValue: true,
      },
    ]);
    expect(prompts.questionCalls).toEqual([
      { message: "Admin email: ", maskInput: false },
      { message: "Admin password (min 8 characters): ", maskInput: true },
      { message: "Repeat password: ", maskInput: true },
    ]);
  });

  it("runs install and migrations without creating a user when auth is declined", async () => {
    const out = new MemoryStdout();
    const runner = new RecordingRunner();
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "onb-"));
    tmpDirs.push(target);
    await fs.writeFile(path.join(target, "package.json"), JSON.stringify({ packageManager: "pnpm@10.13.1" }), "utf8");
    const coordinator = new PostScaffoldOnboardingCoordinator(
      out,
      new ScriptedPrompts(false, []),
      new NodeFileSystem(),
      runner,
      true,
    );
    await coordinator.runAfterScaffold({ targetDirectory: target, noInteraction: false });
    expect(runner.calls).toEqual([
      { command: "pnpm", args: ["install"], cwd: target },
      { command: "pnpm", args: ["exec", "codemation", "db", "migrate"], cwd: target },
    ]);
    expect(out.text).toContain("Authentication skipped");
  });

  it("re-prompts for auth details after a password mismatch instead of aborting setup", async () => {
    const out = new MemoryStdout();
    const runner = new RecordingRunner();
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "onb-"));
    tmpDirs.push(target);
    await fs.writeFile(path.join(target, "package.json"), JSON.stringify({ packageManager: "pnpm@10.13.1" }), "utf8");
    const prompts = new ScriptedPrompts(
      [true, true],
      [
        "admin@example.com",
        "first-password",
        "different-password",
        "admin@example.com",
        "correct-password",
        "correct-password",
      ],
    );
    const coordinator = new PostScaffoldOnboardingCoordinator(out, prompts, new NodeFileSystem(), runner, true);
    await coordinator.runAfterScaffold({ targetDirectory: target, noInteraction: false });
    expect(out.text).toContain(
      "Passwords must match and be at least 8 characters. Leave auth details empty if you want to continue without authentication.",
    );
    expect(prompts.confirmCalls).toEqual([
      {
        message: "\nDo you want authentication enabled? It is recommended and enabled by default.",
        defaultValue: true,
      },
      {
        message: "\nDo you want authentication enabled? It is recommended and enabled by default.",
        defaultValue: true,
      },
    ]);
    expect(runner.calls).toEqual([
      { command: "pnpm", args: ["install"], cwd: target },
      { command: "pnpm", args: ["exec", "codemation", "db", "migrate"], cwd: target },
      {
        command: "pnpm",
        args: [
          "exec",
          "codemation",
          "user",
          "create",
          "--email",
          "admin@example.com",
          "--password",
          "correct-password",
        ],
        cwd: target,
      },
    ]);
  });

  it("returns to the auth question when auth details are left empty", async () => {
    const out = new MemoryStdout();
    const runner = new RecordingRunner();
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "onb-"));
    tmpDirs.push(target);
    await fs.writeFile(path.join(target, "package.json"), JSON.stringify({ packageManager: "pnpm@10.13.1" }), "utf8");
    const prompts = new ScriptedPrompts([true, false], ["", "", ""]);
    const coordinator = new PostScaffoldOnboardingCoordinator(out, prompts, new NodeFileSystem(), runner, true);
    await coordinator.runAfterScaffold({ targetDirectory: target, noInteraction: false });
    expect(out.text).toContain("Authentication details were left empty; returning to the authentication question.");
    expect(runner.calls).toEqual([
      { command: "pnpm", args: ["install"], cwd: target },
      { command: "pnpm", args: ["exec", "codemation", "db", "migrate"], cwd: target },
    ]);
    expect(prompts.confirmCalls).toEqual([
      {
        message: "\nDo you want authentication enabled? It is recommended and enabled by default.",
        defaultValue: true,
      },
      {
        message: "\nDo you want authentication enabled? It is recommended and enabled by default.",
        defaultValue: true,
      },
    ]);
  });

  it("falls back to npm exec syntax when the scaffolded package does not declare pnpm", async () => {
    const out = new MemoryStdout();
    const runner = new RecordingRunner();
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "onb-"));
    tmpDirs.push(target);
    await fs.writeFile(path.join(target, "package.json"), JSON.stringify({ name: "npm-app" }), "utf8");
    const prompts = new ScriptedPrompts(true, ["admin@example.com", "longpassword", "longpassword"]);
    const coordinator = new PostScaffoldOnboardingCoordinator(out, prompts, new NodeFileSystem(), runner, true);

    await coordinator.runAfterScaffold({ targetDirectory: target, noInteraction: false });

    expect(runner.calls).toEqual([
      { command: "npm", args: ["install"], cwd: target },
      { command: "npm", args: ["exec", "--", "codemation", "db", "migrate"], cwd: target },
      {
        command: "npm",
        args: [
          "exec",
          "--",
          "codemation",
          "user",
          "create",
          "--email",
          "admin@example.com",
          "--password",
          "longpassword",
        ],
        cwd: target,
      },
    ]);
    expect(out.text).toContain("npm run dev");
  });

  it("prints manual steps when stdin is not a TTY even without --no-interaction", async () => {
    const out = new MemoryStdout();
    const runner = new RecordingRunner();
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "onb-"));
    tmpDirs.push(target);
    await fs.writeFile(path.join(target, "package.json"), JSON.stringify({ packageManager: "pnpm@10.13.1" }), "utf8");
    const coordinator = new PostScaffoldOnboardingCoordinator(
      out,
      new ScriptedPrompts(false, []),
      new NodeFileSystem(),
      runner,
      false,
    );

    await coordinator.runAfterScaffold({ targetDirectory: target, noInteraction: false });

    expect(runner.calls).toEqual([]);
    expect(out.text).toContain("stdin is not a TTY; skipping interactive onboarding");
    expect(out.text).toContain("pnpm exec codemation db migrate");
  });

  it("returns to the auth question after an invalid email instead of creating a user", async () => {
    const out = new MemoryStdout();
    const runner = new RecordingRunner();
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "onb-"));
    tmpDirs.push(target);
    await fs.writeFile(path.join(target, "package.json"), JSON.stringify({ packageManager: "pnpm@10.13.1" }), "utf8");
    const prompts = new ScriptedPrompts(
      [true, true],
      ["not-an-email", "longpassword", "longpassword", "admin@example.com", "correct-password", "correct-password"],
    );
    const coordinator = new PostScaffoldOnboardingCoordinator(out, prompts, new NodeFileSystem(), runner, true);

    await coordinator.runAfterScaffold({ targetDirectory: target, noInteraction: false });

    expect(out.text).toContain("That does not look like a valid email.");
    expect(prompts.confirmCalls).toEqual([
      {
        message: "\nDo you want authentication enabled? It is recommended and enabled by default.",
        defaultValue: true,
      },
      {
        message: "\nDo you want authentication enabled? It is recommended and enabled by default.",
        defaultValue: true,
      },
    ]);
    expect(runner.calls).toEqual([
      { command: "pnpm", args: ["install"], cwd: target },
      { command: "pnpm", args: ["exec", "codemation", "db", "migrate"], cwd: target },
      {
        command: "pnpm",
        args: [
          "exec",
          "codemation",
          "user",
          "create",
          "--email",
          "admin@example.com",
          "--password",
          "correct-password",
        ],
        cwd: target,
      },
    ]);
  });

  it("runs automated onboarding without prompts when admin credentials are provided", async () => {
    const out = new MemoryStdout();
    const runner = new RecordingRunner();
    const target = await fs.mkdtemp(path.join(os.tmpdir(), "onb-"));
    tmpDirs.push(target);
    await fs.writeFile(path.join(target, "package.json"), JSON.stringify({ packageManager: "pnpm@10.13.1" }), "utf8");
    await fs.writeFile(path.join(target, ".env.example"), "# zero-setup defaults\n", "utf8");
    await fs.writeFile(
      path.join(target, "codemation.config.ts"),
      "export default { app: { auth: { allowUnauthenticatedInDevelopment: true } } };\n",
      "utf8",
    );
    const prompts = new ScriptedPrompts(false, []);
    const coordinator = new PostScaffoldOnboardingCoordinator(out, prompts, new NodeFileSystem(), runner, false);

    await coordinator.runAfterScaffold({
      targetDirectory: target,
      noInteraction: true,
      adminUser: {
        email: "admin@example.com",
        password: "longpassword",
      },
    });
    const config = await fs.readFile(path.join(target, "codemation.config.ts"), "utf8");

    expect(runner.calls).toEqual([
      { command: "pnpm", args: ["install"], cwd: target },
      { command: "pnpm", args: ["exec", "codemation", "db", "migrate"], cwd: target },
      {
        command: "pnpm",
        args: ["exec", "codemation", "user", "create", "--email", "admin@example.com", "--password", "longpassword"],
        cwd: target,
      },
    ]);
    expect(prompts.confirmCalls).toEqual([]);
    expect(prompts.questionCalls).toEqual([]);
    expect(config).toContain("allowUnauthenticatedInDevelopment: false");
    expect(out.text).toContain("Creating admin user");
    expect(out.text).toContain("pnpm dev");
  });
});
