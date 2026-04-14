import assert from "node:assert/strict";
import { test } from "vitest";

import { ConsumerBuildOptionsParser } from "../src/build/ConsumerBuildOptionsParser";
import { CliProgram } from "../src/Program";

class RecordingDevCommand {
  readonly calls: Array<Readonly<{ consumerRoot: string; watchFramework?: boolean }>> = [];

  async execute(args: Readonly<{ consumerRoot: string; watchFramework?: boolean }>): Promise<void> {
    this.calls.push(args);
  }
}

test("CliProgram forwards --watch-framework to the dev command", async () => {
  const devCommand = new RecordingDevCommand();
  const noopCommand = { execute: async () => undefined } as never;
  const program = new CliProgram(
    new ConsumerBuildOptionsParser(),
    noopCommand,
    devCommand as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["dev", "--watch-framework", "--consumer-root", "/tmp/my-automation"]);

  assert.deepEqual(devCommand.calls, [{ consumerRoot: "/tmp/my-automation", watchFramework: true }]);
});

test("CliProgram defaults dev to the packaged UI path", async () => {
  const devCommand = new RecordingDevCommand();
  const noopCommand = { execute: async () => undefined } as never;
  const program = new CliProgram(
    new ConsumerBuildOptionsParser(),
    noopCommand,
    devCommand as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["dev", "--consumer-root", "/tmp/my-automation"]);

  assert.deepEqual(devCommand.calls, [{ consumerRoot: "/tmp/my-automation", watchFramework: false }]);
});

class RecordingSkillsSyncCommand {
  readonly roots: string[] = [];

  async execute(consumerRoot: string): Promise<void> {
    this.roots.push(consumerRoot);
  }
}

test("CliProgram forwards skills sync --consumer-root", async () => {
  const skillsSync = new RecordingSkillsSyncCommand();
  const noopCommand = { execute: async () => undefined } as never;
  const program = new CliProgram(
    new ConsumerBuildOptionsParser(),
    noopCommand,
    noopCommand as never,
    noopCommand,
    noopCommand,
    noopCommand,
    skillsSync as never,
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["skills", "sync", "--consumer-root", "/tmp/skills-consumer"]);

  assert.deepEqual(skillsSync.roots, ["/tmp/skills-consumer"]);
});
