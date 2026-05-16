import assert from "node:assert/strict";
import { test } from "vitest";

import { ConsumerBuildOptionsParser } from "../src/build/ConsumerBuildOptionsParser";
import { CliProgram } from "../src/Program";

const noopCommand = { execute: async () => undefined } as never;

function makeNoopCollectionArgs(): [never, never, never, never, never, never, never, never] {
  return [noopCommand, noopCommand, noopCommand, noopCommand, noopCommand, noopCommand, noopCommand, noopCommand];
}

class RecordingDevCommand {
  readonly calls: Array<Readonly<{ consumerRoot: string; watchFramework?: boolean; apiOnly?: boolean }>> = [];

  async execute(args: Readonly<{ consumerRoot: string; watchFramework?: boolean; apiOnly?: boolean }>): Promise<void> {
    this.calls.push(args);
  }
}

test("CliProgram forwards --watch-framework to the dev command", async () => {
  const devCommand = new RecordingDevCommand();
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
    ...makeNoopCollectionArgs(),
  );

  await program.run(["dev", "--watch-framework", "--consumer-root", "/tmp/my-automation"]);

  assert.deepEqual(devCommand.calls, [{ consumerRoot: "/tmp/my-automation", watchFramework: true, apiOnly: false }]);
});

test("CliProgram defaults dev to the packaged UI path", async () => {
  const devCommand = new RecordingDevCommand();
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
    ...makeNoopCollectionArgs(),
  );

  await program.run(["dev", "--consumer-root", "/tmp/my-automation"]);

  assert.deepEqual(devCommand.calls, [{ consumerRoot: "/tmp/my-automation", watchFramework: false, apiOnly: false }]);
});

test("CliProgram forwards --api-only to the dev command", async () => {
  const devCommand = new RecordingDevCommand();
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
    ...makeNoopCollectionArgs(),
  );

  await program.run(["dev", "--api-only", "--consumer-root", "/tmp/my-automation"]);

  assert.deepEqual(devCommand.calls, [{ consumerRoot: "/tmp/my-automation", watchFramework: false, apiOnly: true }]);
});

class RecordingSkillsSyncCommand {
  readonly roots: string[] = [];

  async execute(consumerRoot: string): Promise<void> {
    this.roots.push(consumerRoot);
  }
}

test("CliProgram forwards skills sync --consumer-root", async () => {
  const skillsSync = new RecordingSkillsSyncCommand();
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
    ...makeNoopCollectionArgs(),
  );

  await program.run(["skills", "sync", "--consumer-root", "/tmp/skills-consumer"]);

  assert.deepEqual(skillsSync.roots, ["/tmp/skills-consumer"]);
});

class RecordingCollectionsListCommand {
  readonly calls: Array<unknown> = [];

  async execute(opts: unknown): Promise<void> {
    this.calls.push(opts);
  }
}

test("CliProgram forwards collections list --format json", async () => {
  const listCommand = new RecordingCollectionsListCommand();
  const program = new CliProgram(
    new ConsumerBuildOptionsParser(),
    noopCommand,
    noopCommand as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    listCommand as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["collections", "list", "--format", "json"]);

  assert.equal(listCommand.calls.length, 1);
  assert.deepEqual((listCommand.calls[0] as Record<string, unknown>).format, "json");
});

class RecordingCollectionsSyncCommand {
  readonly calls: Array<unknown> = [];

  async execute(opts: unknown): Promise<void> {
    this.calls.push(opts);
  }
}

test("CliProgram forwards collections sync --dry-run", async () => {
  const syncCommand = new RecordingCollectionsSyncCommand();
  const program = new CliProgram(
    new ConsumerBuildOptionsParser(),
    noopCommand,
    noopCommand as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    syncCommand as never,
  );

  await program.run(["collections", "sync", "--dry-run"]);

  assert.equal(syncCommand.calls.length, 1);
  assert.deepEqual((syncCommand.calls[0] as Record<string, unknown>).dryRun, true);
});
