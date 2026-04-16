import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

class RunCodemationTsxHarness {
  private static readonly repoRoot = path.resolve(import.meta.dirname, "../..");
  private static readonly runnerPath = path.join(
    RunCodemationTsxHarness.repoRoot,
    "tooling/scripts/run-codemation-tsx.mjs",
  );

  private readonly temporaryDirectory = mkdtempSync(path.join(os.tmpdir(), "run-codemation-tsx-"));
  private readonly entrypointPath = path.join(this.temporaryDirectory, "entrypoint.ts");
  private readonly tsconfigPath = path.join(this.temporaryDirectory, "tsconfig.json");
  private child: ChildProcess | null = null;
  private stdout = "";
  private stderr = "";

  constructor() {
    writeFileSync(
      this.entrypointPath,
      [
        "const keepAlive = setInterval(() => undefined, 1000);",
        'process.stdout.write("ready\\n");',
        'process.on("SIGINT", () => {',
        "  clearInterval(keepAlive);",
        '  process.stdout.write("child-saw-sigint\\n");',
        "  process.exit(0);",
        "});",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      this.tsconfigPath,
      JSON.stringify(
        {
          compilerOptions: {
            module: "NodeNext",
            moduleResolution: "NodeNext",
            target: "ES2022",
          },
        },
        null,
        2,
      ),
      "utf8",
    );
  }

  start(): void {
    this.child = spawn(process.execPath, [RunCodemationTsxHarness.runnerPath, this.entrypointPath, this.tsconfigPath], {
      cwd: RunCodemationTsxHarness.repoRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.child.stdout?.on("data", (chunk: Buffer | string) => {
      this.stdout += chunk.toString();
    });
    this.child.stderr?.on("data", (chunk: Buffer | string) => {
      this.stderr += chunk.toString();
    });
  }

  async waitForReady(): Promise<void> {
    await this.waitForOutput("ready\n");
  }

  sendSigint(): void {
    if (!this.child) {
      throw new Error("Harness process has not started.");
    }
    this.child.kill("SIGINT");
  }

  async waitForExit(): Promise<Readonly<{ code: number | null; signal: NodeJS.Signals | null }>> {
    const child = this.requireChild();
    if (child.exitCode !== null || child.signalCode !== null) {
      return { code: child.exitCode, signal: child.signalCode };
    }
    return await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => {
        resolve({ code, signal });
      });
    });
  }

  assertStdoutContains(expected: string): void {
    expect(this.stdout).toContain(expected);
  }

  assertNoStderr(): void {
    expect(this.stderr).toBe("");
  }

  dispose(): void {
    if (this.child && this.child.exitCode === null && this.child.signalCode === null) {
      this.child.kill("SIGKILL");
    }
    rmSync(this.temporaryDirectory, { force: true, recursive: true });
  }

  private requireChild(): ChildProcess {
    if (!this.child) {
      throw new Error("Harness process has not started.");
    }
    return this.child;
  }

  private waitForOutput(expected: string): Promise<void> {
    const child = this.requireChild();
    if (this.stdout.includes(expected)) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + 10000;
      const timer = setInterval(() => {
        if (this.stdout.includes(expected)) {
          clearInterval(timer);
          resolve();
          return;
        }
        if (child.exitCode !== null || child.signalCode !== null) {
          clearInterval(timer);
          reject(
            new Error(`Process exited before emitting ${expected.trim()}. stdout=${this.stdout} stderr=${this.stderr}`),
          );
          return;
        }
        if (Date.now() >= deadline) {
          clearInterval(timer);
          reject(new Error(`Timed out waiting for ${expected.trim()}. stdout=${this.stdout} stderr=${this.stderr}`));
        }
      }, 20);
    });
  }
}

const activeHarnesses: RunCodemationTsxHarness[] = [];

afterEach(() => {
  for (const harness of activeHarnesses.splice(0)) {
    harness.dispose();
  }
});

describe("run-codemation-tsx.mjs", () => {
  it("forwards SIGINT to the tsx child process", async () => {
    const harness = new RunCodemationTsxHarness();
    activeHarnesses.push(harness);
    harness.start();
    await harness.waitForReady();

    harness.sendSigint();
    const exit = await harness.waitForExit();

    expect(exit.code).toBe(0);
    expect(exit.signal).toBe(null);
    harness.assertStdoutContains("child-saw-sigint");
    harness.assertNoStderr();
  });
});
