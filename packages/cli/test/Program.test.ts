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
    noopCommand,
    noopCommand,
    noopCommand,
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
    noopCommand,
    noopCommand,
    noopCommand,
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
    noopCommand,
    noopCommand,
    noopCommand,
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
    noopCommand,
    noopCommand,
    noopCommand,
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
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["collections", "sync", "--dry-run"]);

  assert.equal(syncCommand.calls.length, 1);
  assert.deepEqual((syncCommand.calls[0] as Record<string, unknown>).dryRun, true);
});

class RecordingBuildCommand {
  readonly calls: Array<{ root: string }> = [];
  async execute(root: string): Promise<void> {
    this.calls.push({ root });
  }
}

class RecordingDevPluginCommand {
  readonly calls: Array<unknown> = [];
  async execute(opts: unknown): Promise<void> {
    this.calls.push(opts);
  }
}

class RecordingServeWebCommand {
  readonly calls: Array<{ root: string }> = [];
  async execute(root: string): Promise<void> {
    this.calls.push({ root });
  }
}

class RecordingServeWorkerCommand {
  readonly calls: Array<{ root: string; config?: string }> = [];
  async execute(root: string, config?: string): Promise<void> {
    this.calls.push({ root, config });
  }
}

class RecordingDbMigrateCommand {
  readonly calls: Array<unknown> = [];
  async execute(opts: unknown): Promise<void> {
    this.calls.push(opts);
  }
}

class RecordingUserCreateCommand {
  readonly calls: Array<unknown> = [];
  async execute(opts: unknown): Promise<void> {
    this.calls.push(opts);
  }
}

class RecordingUserListCommand {
  readonly calls: Array<unknown> = [];
  async execute(opts: unknown): Promise<void> {
    this.calls.push(opts);
  }
}

class RecordingCollectionsShowCommand {
  readonly calls: Array<unknown> = [];
  async execute(opts: unknown): Promise<void> {
    this.calls.push(opts);
  }
}

test("CliProgram invokes build command action", async () => {
  const buildCmd = new RecordingBuildCommand();
  const program = new CliProgram(
    new ConsumerBuildOptionsParser(),
    buildCmd as never,
    noopCommand as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    ...makeNoopCollectionArgs(),
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["build", "--consumer-root", "/tmp/build-root"]);

  assert.equal(buildCmd.calls.length, 1);
  assert.equal(buildCmd.calls[0]?.root, "/tmp/build-root");
});

test("CliProgram invokes dev:plugin command action", async () => {
  const devPlugin = new RecordingDevPluginCommand();
  const program = new CliProgram(
    new ConsumerBuildOptionsParser(),
    noopCommand,
    noopCommand as never,
    devPlugin as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    ...makeNoopCollectionArgs(),
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["dev:plugin", "--plugin-root", "/tmp/plugin-root"]);

  assert.equal(devPlugin.calls.length, 1);
  assert.deepEqual((devPlugin.calls[0] as Record<string, unknown>).pluginRoot, "/tmp/plugin-root");
});

test("CliProgram invokes serve web command action", async () => {
  const serveWeb = new RecordingServeWebCommand();
  const program = new CliProgram(
    new ConsumerBuildOptionsParser(),
    noopCommand,
    noopCommand as never,
    noopCommand,
    serveWeb as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    ...makeNoopCollectionArgs(),
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["serve", "web", "--consumer-root", "/tmp/serve-root"]);

  assert.equal(serveWeb.calls.length, 1);
  assert.equal(serveWeb.calls[0]?.root, "/tmp/serve-root");
});

test("CliProgram invokes serve worker command action", async () => {
  const serveWorker = new RecordingServeWorkerCommand();
  const program = new CliProgram(
    new ConsumerBuildOptionsParser(),
    noopCommand,
    noopCommand as never,
    noopCommand,
    noopCommand,
    serveWorker as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    ...makeNoopCollectionArgs(),
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["serve", "worker", "--consumer-root", "/tmp/worker-root"]);

  assert.equal(serveWorker.calls.length, 1);
  assert.equal(serveWorker.calls[0]?.root, "/tmp/worker-root");
});

test("CliProgram invokes db migrate command action", async () => {
  const dbMigrate = new RecordingDbMigrateCommand();
  const program = new CliProgram(
    new ConsumerBuildOptionsParser(),
    noopCommand,
    noopCommand as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    dbMigrate as never,
    noopCommand,
    noopCommand,
    ...makeNoopCollectionArgs(),
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["db", "migrate", "--consumer-root", "/tmp/db-root"]);

  assert.equal(dbMigrate.calls.length, 1);
});

test("CliProgram invokes user create command action", async () => {
  const userCreate = new RecordingUserCreateCommand();
  const program = new CliProgram(
    new ConsumerBuildOptionsParser(),
    noopCommand,
    noopCommand as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    userCreate as never,
    noopCommand,
    ...makeNoopCollectionArgs(),
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["user", "create", "--email", "admin@example.com", "--password", "mysecret"]);

  assert.equal(userCreate.calls.length, 1);
  assert.deepEqual((userCreate.calls[0] as Record<string, unknown>).email, "admin@example.com");
});

test("CliProgram invokes user list command action", async () => {
  const userList = new RecordingUserListCommand();
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
    userList as never,
    ...makeNoopCollectionArgs(),
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["user", "list"]);

  assert.equal(userList.calls.length, 1);
});

test("CliProgram invokes collections show command action", async () => {
  const showCmd = new RecordingCollectionsShowCommand();
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
    showCmd as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["collections", "show", "my-collection"]);

  assert.equal(showCmd.calls.length, 1);
  assert.deepEqual((showCmd.calls[0] as Record<string, unknown>).name, "my-collection");
});

class RecordingGenericCommand {
  readonly calls: Array<unknown> = [];
  async execute(opts: unknown): Promise<void> {
    this.calls.push(opts);
  }
}

test("CliProgram invokes collections rows command action", async () => {
  const rowsCmd = new RecordingGenericCommand();
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
    rowsCmd as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["collections", "rows", "my-collection"]);

  assert.equal(rowsCmd.calls.length, 1);
  assert.deepEqual((rowsCmd.calls[0] as Record<string, unknown>).name, "my-collection");
});

test("CliProgram invokes collections get command action", async () => {
  const getCmd = new RecordingGenericCommand();
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
    getCmd as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["collections", "get", "my-collection", "row-id-1"]);

  assert.equal(getCmd.calls.length, 1);
  assert.deepEqual((getCmd.calls[0] as Record<string, unknown>).name, "my-collection");
  assert.deepEqual((getCmd.calls[0] as Record<string, unknown>).id, "row-id-1");
});

test("CliProgram invokes collections insert command action", async () => {
  const insertCmd = new RecordingGenericCommand();
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
    insertCmd as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["collections", "insert", "my-collection", "--data", '{"name":"test"}']);

  assert.equal(insertCmd.calls.length, 1);
});

test("CliProgram invokes collections update command action", async () => {
  const updateCmd = new RecordingGenericCommand();
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
    updateCmd as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["collections", "update", "my-collection", "row-id-1", "--patch", '{"name":"updated"}']);

  assert.equal(updateCmd.calls.length, 1);
  assert.deepEqual((updateCmd.calls[0] as Record<string, unknown>).name, "my-collection");
  assert.deepEqual((updateCmd.calls[0] as Record<string, unknown>).id, "row-id-1");
});

test("CliProgram invokes collections delete command action", async () => {
  const deleteCmd = new RecordingGenericCommand();
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
    deleteCmd as never,
    noopCommand,
    noopCommand,
    noopCommand,
    noopCommand,
  );

  await program.run(["collections", "delete", "my-collection", "row-id-1"]);

  assert.equal(deleteCmd.calls.length, 1);
  assert.deepEqual((deleteCmd.calls[0] as Record<string, unknown>).name, "my-collection");
});

test("CliProgram invokes example verify command action", async () => {
  const exampleCmd = new RecordingGenericCommand();
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
    ...makeNoopCollectionArgs(),
    exampleCmd as never,
    noopCommand,
    noopCommand,
  );

  await program.run(["example", "verify", "/tmp/my-example.ts"]);

  assert.equal(exampleCmd.calls.length, 1);
  assert.deepEqual(exampleCmd.calls[0], "/tmp/my-example.ts");
});
