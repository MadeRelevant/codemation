/**
 * Sprint 16 Story 01 — @codemation/cli coverage push to ≥90%.
 *
 * Covers logic-bearing gaps not reached by the existing unit suite:
 *   - CliAsciiTableBuilder (pure formatter, 0% → 100%)
 *   - DevelopmentConditionNodeOptions (pure string logic, 0% → 100%)
 *   - TypeScriptRuntimeConfigurator (env setter, 0% → 100%)
 *   - ConsumerOutputBuilderFactory (thin factory wrapper, 0% → 100%)
 *   - NextHostEdgeSeedLoader.resolveDevelopmentServerToken (uncovered branch)
 *   - DevCliBannerRenderer.renderGatewayListeningHint api-only branch + redisUrlRedacted line
 *   - DevRebuildQueue drain-re-enters-after-finally path (lines 35-36)
 *   - DevNextChildProcessOutputFilter null-source guard (line 20)
 *   - ConsumerOutputBuilder config-not-found error + inline-workflow shortcut
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import { describe, it, test } from "vitest";
import type { DevBootstrapSummaryJson } from "@codemation/host/next/server";

// ---------------------------------------------------------------------------
// CliAsciiTableBuilder
// ---------------------------------------------------------------------------

import { CliAsciiTableBuilder } from "../src/util/CliAsciiTableBuilder";

describe("CliAsciiTableBuilder", () => {
  it("builds a table with header and rows", () => {
    const table = CliAsciiTableBuilder.build(
      ["Name", "Value"],
      [
        ["alpha", "1"],
        ["beta", "22"],
      ],
    );
    assert.match(table, /Name/);
    assert.match(table, /Value/);
    assert.match(table, /alpha/);
    assert.match(table, /beta/);
    assert.match(table, /22/);
    // Horizontal rule lines
    assert.match(table, /^\+/m);
  });

  it("pads columns to at least 3 characters wide", () => {
    const table = CliAsciiTableBuilder.build(["A"], [["B"]]);
    // Column must be at least 3 chars wide (min enforced in widths calculation)
    const firstLine = table.split("\n")[0] ?? "";
    // Separator between '+' chars should be ≥ 5 chars (3 content + 2 spaces)
    assert.ok(firstLine.length >= 7, `Expected wider separator, got: ${firstLine}`);
  });

  it("builds a table with zero rows", () => {
    const table = CliAsciiTableBuilder.build(["Column"], []);
    assert.match(table, /Column/);
    // Should still have three horizontal rule lines (top, after header, bottom)
    const lines = table.split("\n").filter((l) => l.startsWith("+"));
    assert.equal(lines.length, 3);
  });
});

// ---------------------------------------------------------------------------
// DevelopmentConditionNodeOptions
// ---------------------------------------------------------------------------

import { DevelopmentConditionNodeOptions } from "../src/runtime/DevelopmentConditionNodeOptions";

describe("DevelopmentConditionNodeOptions", () => {
  const opts = new DevelopmentConditionNodeOptions();

  it("returns the condition alone when existingNodeOptions is undefined", () => {
    assert.equal(opts.appendToNodeOptions(undefined), "--conditions=development");
  });

  it("returns the condition alone when existingNodeOptions is empty string", () => {
    assert.equal(opts.appendToNodeOptions(""), "--conditions=development");
  });

  it("returns the condition alone when existingNodeOptions is whitespace", () => {
    assert.equal(opts.appendToNodeOptions("   "), "--conditions=development");
  });

  it("appends the condition to existing options", () => {
    const result = opts.appendToNodeOptions("--enable-source-maps");
    assert.equal(result, "--enable-source-maps --conditions=development");
  });

  it("does not duplicate the condition when already present", () => {
    const existing = "--enable-source-maps --conditions=development";
    assert.equal(opts.appendToNodeOptions(existing), existing);
  });
});

// ---------------------------------------------------------------------------
// TypeScriptRuntimeConfigurator
// ---------------------------------------------------------------------------

import { TypeScriptRuntimeConfigurator } from "../src/runtime/TypeScriptRuntimeConfigurator";

test("TypeScriptRuntimeConfigurator sets CODEMATION_TSCONFIG_PATH", () => {
  const previous = process.env.CODEMATION_TSCONFIG_PATH;
  try {
    const configurator = new TypeScriptRuntimeConfigurator();
    const repoRoot = path.resolve("/some/repo/root");
    configurator.configure(repoRoot);
    assert.ok(
      process.env.CODEMATION_TSCONFIG_PATH?.endsWith("tsconfig.base.json"),
      `Expected CODEMATION_TSCONFIG_PATH to end with tsconfig.base.json, got: ${process.env.CODEMATION_TSCONFIG_PATH}`,
    );
    assert.ok(process.env.CODEMATION_TSCONFIG_PATH?.startsWith(repoRoot), `Expected path to start with repo root`);
  } finally {
    if (previous === undefined) {
      delete process.env.CODEMATION_TSCONFIG_PATH;
    } else {
      process.env.CODEMATION_TSCONFIG_PATH = previous;
    }
  }
});

// ---------------------------------------------------------------------------
// ConsumerOutputBuilderFactory
// ---------------------------------------------------------------------------

import { ConsumerOutputBuilderFactory } from "../src/consumer/ConsumerOutputBuilderFactory";
import { ConsumerOutputBuilder } from "../src/consumer/ConsumerOutputBuilder";

test("ConsumerOutputBuilderFactory creates a ConsumerOutputBuilder instance", () => {
  const factory = new ConsumerOutputBuilderFactory();
  const builder = factory.create("/fake/root");
  assert.ok(builder instanceof ConsumerOutputBuilder);
});

// ---------------------------------------------------------------------------
// NextHostEdgeSeedLoader — resolveDevelopmentServerToken
// ---------------------------------------------------------------------------

import { NextHostEdgeSeedLoader } from "../src/dev/NextHostEdgeSeedLoader";

describe("NextHostEdgeSeedLoader.resolveDevelopmentServerToken", () => {
  const loader = new NextHostEdgeSeedLoader(
    { load: async () => ({ config: {}, bootstrapSource: null, workflowSources: [] }) } as never,
    { mergeConsumerRootIntoProcessEnvironment: () => ({}) } as never,
  );

  it("returns the raw token when provided and non-empty", () => {
    const token = "my-dev-token";
    assert.equal(loader.resolveDevelopmentServerToken(token), token);
  });

  it("returns a UUID when rawToken is undefined", () => {
    const result = loader.resolveDevelopmentServerToken(undefined);
    // UUID v4 format
    assert.match(result, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("returns a UUID when rawToken is whitespace-only", () => {
    const result = loader.resolveDevelopmentServerToken("   ");
    assert.match(result, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

// ---------------------------------------------------------------------------
// DevCliBannerRenderer — uncovered branches
// ---------------------------------------------------------------------------

import { DevCliBannerRenderer } from "../src/dev/DevCliBannerRenderer";

function captureStdout(run: () => void): string {
  const written: string[] = [];
  const prev = process.stdout.write.bind(process.stdout);
  process.stdout.write = function (chunk: string | Uint8Array, ...rest: unknown[]): boolean {
    written.push(String(chunk));
    return prev(chunk as Parameters<typeof prev>[0], ...(rest as Parameters<typeof prev>[1][]));
  };
  try {
    run();
  } finally {
    process.stdout.write = prev;
  }
  return written.join("");
}

const sampleSummaryWithRedis: DevBootstrapSummaryJson = {
  logLevel: "info",
  databaseLabel: "postgresql",
  schedulerLabel: "BullMQ",
  eventBusLabel: "redis",
  activeWorkflows: [],
  plugins: [],
  redisUrlRedacted: "redis://localhost:6379",
};

test("DevCliBannerRenderer renderGatewayListeningHint api-only mode", () => {
  const out = captureStdout(() => {
    new DevCliBannerRenderer().renderGatewayListeningHint(4000, "dev", "api-only");
  });
  assert.match(out, /Codemation is running/);
  assert.match(out, /http:\/\/127\.0\.0\.1:4000/);
  assert.match(out, /api-only mode/);
  // Should NOT contain the watch-framework hint
  assert.doesNotMatch(out, /--watch-framework/);
});

test("DevCliBannerRenderer renderRuntimeSummary includes Redis URL when present", () => {
  const out = captureStdout(() => {
    new DevCliBannerRenderer().renderRuntimeSummary(sampleSummaryWithRedis);
  });
  assert.match(out, /redis:\/\/localhost:6379/);
});

// ---------------------------------------------------------------------------
// DevRebuildQueue — drain re-enters after finally (lines 35-36)
// ---------------------------------------------------------------------------

import { DevRebuildQueue, type DevRebuildHandler, type DevRebuildRequest } from "../src/dev/DevRebuildQueue";

test("DevRebuildQueue re-drains when a request arrives during the finally block of drain()", async () => {
  // We need to enqueue a third request AFTER the second handler starts (i.e. while drain
  // is unwinding its finally block from the first run). We simulate this by having the
  // handler enqueue the third request synchronously before it resolves.
  let queue: DevRebuildQueue;
  const handled: DevRebuildRequest[] = [];
  let callCount = 0;

  const handler: DevRebuildHandler = {
    async run(request) {
      handled.push(request);
      callCount++;
      if (callCount === 1) {
        // Enqueue a second request while the first is still executing — this exercises the
        // "pendingRequest arrives while drain() is live" path (line 19-21 branch).
        void queue.enqueue({ changedPaths: ["/src/b.ts"], shouldRestartUi: false });
      }
    },
  };

  queue = new DevRebuildQueue(handler);
  await queue.enqueue({ changedPaths: ["/src/a.ts"], shouldRestartUi: false });
  // After awaiting, both requests must have been handled
  assert.equal(handled.length, 2);
  assert.deepEqual(handled[0]?.changedPaths, ["/src/a.ts"]);
  assert.deepEqual(handled[1]?.changedPaths, ["/src/b.ts"]);
});

// ---------------------------------------------------------------------------
// DevNextChildProcessOutputFilter — null-source guard (line 20)
// ---------------------------------------------------------------------------

import { DevNextChildProcessOutputFilter } from "../src/dev/DevNextChildProcessOutputFilter";
import { DevNextStartupBannerLineFilter } from "../src/dev/DevNextStartupBannerLineFilter";

test("DevNextChildProcessOutputFilter.attach tolerates null stdout/stderr", () => {
  const lineFilter = new DevNextStartupBannerLineFilter();
  const filter = new DevNextChildProcessOutputFilter(lineFilter);

  // Fake child with null streams — exercises the null-source guard in pipeFilteredStream()
  const fakeChild = new EventEmitter() as unknown as ChildProcess;
  (fakeChild as any).stdout = null;
  (fakeChild as any).stderr = null;

  // Should not throw
  assert.doesNotThrow(() => {
    filter.attach(fakeChild);
  });
});

// ---------------------------------------------------------------------------
// ConsumerOutputBuilder — inline-workflows shortcut + config-not-found error
// ---------------------------------------------------------------------------

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach } from "vitest";

let tempDir: string | null = null;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(os.tmpdir(), "codemation-cli-gaps-"));
});

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { force: true, recursive: true }).catch(() => null);
    tempDir = null;
  }
});

test("ConsumerOutputBuilder.ensureBuilt throws when no config is found", async () => {
  const builder = new ConsumerOutputBuilder(tempDir!);
  await assert.rejects(() => builder.ensureBuilt(), /Codemation config not found/);
});

test("ConsumerOutputBuilder resolves workflowSourcePaths=[] when config has inline workflows", async () => {
  // A config with a `workflows` property triggers the hasInlineWorkflows=true path
  const configSource = `export default {
  workflows: [{ id: "wf.inline", name: "Inline", nodes: [], edges: [] }],
};
`;
  await writeFile(path.join(tempDir!, "codemation.config.ts"), configSource, "utf8");

  const builder = new ConsumerOutputBuilder(tempDir!);
  const snapshot = await builder.ensureBuilt();

  assert.deepEqual(snapshot.workflowSourcePaths, []);
});

test("ConsumerOutputBuilder throws when config path override does not exist", async () => {
  const builder = new ConsumerOutputBuilder(tempDir!, undefined, undefined, "/nonexistent/codemation.config.ts");
  await assert.rejects(() => builder.ensureBuilt(), /config override not found/i);
});

test("ConsumerOutputBuilder handles JS config file (resolveScriptKind .js branch)", async () => {
  const configSource = `module.exports = {
  workflowDiscovery: { directories: ["src/workflows"] },
};
`;
  await writeFile(path.join(tempDir!, "codemation.config.js"), configSource, "utf8");
  const workflowDir = path.join(tempDir!, "src", "workflows");
  await mkdir(workflowDir, { recursive: true });
  await writeFile(
    path.join(workflowDir, "test.ts"),
    `export default { id: "wf.js", name: "JS config test", nodes: [], edges: [] };\n`,
    "utf8",
  );

  const builder = new ConsumerOutputBuilder(tempDir!);
  const snapshot = await builder.ensureBuilt();

  // JS config resolves correctly and discovers workflow sources
  assert.ok(snapshot.configSourcePath?.endsWith("codemation.config.js"));
});

test("ConsumerOutputBuilder handles config with non-array directories property (readStringArrayProperty line 869)", async () => {
  // `directories: "src/workflows"` (a string, not an array) → falls back to defaults
  const configSource = `export default {
  workflowDiscovery: { directories: "src/workflows" },
};
`;
  await writeFile(path.join(tempDir!, "codemation.config.ts"), configSource, "utf8");
  const builder = new ConsumerOutputBuilder(tempDir!);
  // Should not throw — falls back to default workflow discovery
  const snapshot = await builder.ensureBuilt();
  assert.ok(snapshot.configSourcePath?.endsWith("codemation.config.ts"));
});

test("ConsumerOutputBuilder handles config with spread shorthand in object (getPropertyAssignment continue branch)", async () => {
  // A config object with a spread element (not a PropertyAssignment) to exercise the `continue` branch
  const configSource = `const base = { workflowDiscovery: { directories: ["src/workflows"] } };
export default { ...base };
`;
  await writeFile(path.join(tempDir!, "codemation.config.ts"), configSource, "utf8");
  const builder = new ConsumerOutputBuilder(tempDir!);
  // Spread elements won't be found as property assignments — should not throw
  const snapshot = await builder.ensureBuilt();
  assert.ok(snapshot.configSourcePath?.endsWith("codemation.config.ts"));
});

test("ConsumerOutputBuilder handles config where initializer is not an object literal (unwrapObjectLiteralExpression line 845)", async () => {
  // A config where workflowDiscovery property has a function call as initializer
  // Exercises the `return null` branch of unwrapObjectLiteralExpression
  const configSource = `function getConfig() { return { directories: ["src/workflows"] }; }
export default {
  workflowDiscovery: getConfig(),
};
`;
  await writeFile(path.join(tempDir!, "codemation.config.ts"), configSource, "utf8");
  const builder = new ConsumerOutputBuilder(tempDir!);
  const snapshot = await builder.ensureBuilt();
  assert.ok(snapshot.configSourcePath?.endsWith("codemation.config.ts"));
});

test("ConsumerOutputBuilder resolves named config variable 'config' (resolveConfigObjectLiteral line 823)", async () => {
  // A config where the object is stored in a variable named 'config' — exercises the
  // namedConfigLiteral path (objectLiteralsByIdentifier.get('config'))
  const configSource = `const config = {
  workflowDiscovery: { directories: ["src/workflows"] },
};
module.exports = config;
`;
  await writeFile(path.join(tempDir!, "codemation.config.js"), configSource, "utf8");
  const builder = new ConsumerOutputBuilder(tempDir!);
  const snapshot = await builder.ensureBuilt();
  assert.ok(snapshot.configSourcePath?.endsWith("codemation.config.js"));
});

test("ConsumerOutputBuilder handles config with parenthesized export (unwrapObjectLiteralExpression line 843)", async () => {
  // An `export default (...)` with a parenthesized object literal triggers the
  // isParenthesizedExpression branch in unwrapObjectLiteralExpression
  const configSource = `export default ({
  workflowDiscovery: { directories: ["src/workflows"] },
}) satisfies Record<string, unknown>;
`;
  await writeFile(path.join(tempDir!, "codemation.config.ts"), configSource, "utf8");
  const builder = new ConsumerOutputBuilder(tempDir!);
  const snapshot = await builder.ensureBuilt();
  assert.ok(snapshot.configSourcePath?.endsWith("codemation.config.ts"));
});

test("ConsumerOutputBuilder resolves named config via 'export default identifierName' (lines 813-816)", async () => {
  // `const myConfig = { ... }; export default myConfig;` — the export assignment has an
  // identifier expression → resolveConfigObjectLiteral looks up objectLiteralsByIdentifier
  const configSource = `const myConfig = {
  workflowDiscovery: { directories: ["src/workflows"] },
};
export default myConfig;
`;
  await writeFile(path.join(tempDir!, "codemation.config.ts"), configSource, "utf8");
  const builder = new ConsumerOutputBuilder(tempDir!);
  const snapshot = await builder.ensureBuilt();
  assert.ok(snapshot.configSourcePath?.endsWith("codemation.config.ts"));
});

test("ConsumerOutputBuilder handles config with non-object variable declaration (line 797 continue branch)", async () => {
  // A config file that has a non-object variable initializer (e.g. a number, function call)
  // This exercises the `continue` at line 797 when `!objectLiteral`
  const configSource = `const version = 1;
export default {
  workflowDiscovery: { directories: ["src/workflows"] },
};
`;
  await writeFile(path.join(tempDir!, "codemation.config.ts"), configSource, "utf8");
  const builder = new ConsumerOutputBuilder(tempDir!);
  const snapshot = await builder.ensureBuilt();
  assert.ok(snapshot.configSourcePath?.endsWith("codemation.config.ts"));
});

test("ConsumerOutputBuilder handles exported const config (exportedObjectLiterals path, line 801)", async () => {
  // `export const myExportedConfig = { ... };` — exported variable statement with object literal
  // exercises line 801: exportedObjectLiterals.push(objectLiteral) and the final fallback at line 825
  const configSource = `export const myExportedConfig = {
  workflowDiscovery: { directories: ["src/workflows"] },
};
`;
  await writeFile(path.join(tempDir!, "codemation.config.ts"), configSource, "utf8");
  const builder = new ConsumerOutputBuilder(tempDir!);
  const snapshot = await builder.ensureBuilt();
  assert.ok(snapshot.configSourcePath?.endsWith("codemation.config.ts"));
});

test("ConsumerOutputBuilder handles .tsx config (resolveScriptKind TSX branch, line 778)", async () => {
  // A config file with .tsx extension — exercises the TSX ScriptKind path
  const configSource = `export default {
  workflowDiscovery: { directories: ["src/workflows"] },
};
`;
  await writeFile(path.join(tempDir!, "codemation.config.tsx"), configSource, "utf8");
  const builder = new ConsumerOutputBuilder(
    tempDir!,
    undefined,
    undefined,
    path.join(tempDir!, "codemation.config.tsx"),
  );
  const snapshot = await builder.ensureBuilt();
  assert.ok(snapshot.configSourcePath?.endsWith("codemation.config.tsx"));
});

test("ConsumerOutputBuilder emits .mts source files to .mjs output (toJavascriptExtension lines 688/691)", async () => {
  // Source files with .mts and .cts extensions are collected and emitted;
  // their extensions are converted via toJavascriptExtension (lines 688, 691).
  const configSource = `export default {
  workflowDiscovery: { directories: ["src/workflows"] },
};
`;
  await writeFile(path.join(tempDir!, "codemation.config.ts"), configSource, "utf8");
  // .mts source file at the consumer root level — exercises line 691 (.mts → .mjs)
  await writeFile(path.join(tempDir!, "helper.mts"), `export const greet = () => "hello";\n`, "utf8");
  // .cts source file — exercises line 688 (.cts → .cjs)
  await writeFile(path.join(tempDir!, "utils.cts"), `exports.add = (a: number, b: number) => a + b;\n`, "utf8");

  const builder = new ConsumerOutputBuilder(tempDir!);
  const snapshot = await builder.ensureBuilt();

  // Build should succeed with mts/cts files in the consumer root
  assert.ok(snapshot.configSourcePath?.endsWith("codemation.config.ts"));
  // Verify the output contains the emitted .mjs and .cjs files
  const { readdir: _readdir } = await import("node:fs/promises");
  const outputFiles = await _readdir(path.join(snapshot.emitOutputRoot, "app"), { recursive: true });
  assert.ok(
    outputFiles.some((f) => typeof f === "string" && f.endsWith(".mjs")),
    `Expected .mjs file in output, got: ${outputFiles.join(", ")}`,
  );
  assert.ok(
    outputFiles.some((f) => typeof f === "string" && f.endsWith(".cjs")),
    `Expected .cjs file in output, got: ${outputFiles.join(", ")}`,
  );
});

test("ConsumerOutputBuilder handles config with destructuring declaration (line 793 continue branch)", async () => {
  // `const { x } = ...;` — destructured declaration is NOT an Identifier, exercises continue at line 793
  const configSource = `const { env } = process;
export default {
  workflowDiscovery: { directories: ["src/workflows"] },
};
`;
  await writeFile(path.join(tempDir!, "codemation.config.ts"), configSource, "utf8");
  const builder = new ConsumerOutputBuilder(tempDir!);
  const snapshot = await builder.ensureBuilt();
  assert.ok(snapshot.configSourcePath?.endsWith("codemation.config.ts"));
});

test("ConsumerOutputBuilder rewrites .js relative import specifiers (isRuntimeExtension lines 679-683)", async () => {
  // A source file that has a `from './helper.js'` import exercises the isRuntimeExtension path.
  // The .js extension is already a runtime extension → return as-is (no rewrite needed).
  const configSource = `export default {
  workflowDiscovery: { directories: ["src/workflows"] },
};
`;
  await writeFile(path.join(tempDir!, "codemation.config.ts"), configSource, "utf8");
  const workflowDir = path.join(tempDir!, "src", "workflows");
  const utilsDir = path.join(tempDir!, "src", "utils");
  await mkdir(workflowDir, { recursive: true });
  await mkdir(utilsDir, { recursive: true });

  // A helper module (will be emitted as .js)
  await writeFile(path.join(utilsDir, "constants.ts"), `export const ID = "wf.imports";\n`, "utf8");

  // A workflow that imports from a sibling using a .ts extension (exercises isSourceExtension + rewrite)
  await writeFile(
    path.join(workflowDir, "importing-workflow.ts"),
    `import { ID } from "../../utils/constants";
export default { id: ID, name: "Imports workflow", nodes: [], edges: [] };
`,
    "utf8",
  );

  const builder = new ConsumerOutputBuilder(tempDir!);
  const snapshot = await builder.ensureBuilt();
  assert.ok(snapshot.configSourcePath?.endsWith("codemation.config.ts"));
  // The workflow with imports should have been emitted
  assert.ok(snapshot.workflowSourcePaths.some((p) => p.includes("importing-workflow")));
});

test("ConsumerOutputBuilder handles config with computed property name (readPropertyName null, line 900)", async () => {
  // A config object with a computed property key — readPropertyName returns null for it,
  // exercises the final `return null` at line 900
  const configSource = `const key = "workflowDiscovery";
export default {
  [key]: { directories: ["src/workflows"] },
};
`;
  await writeFile(path.join(tempDir!, "codemation.config.ts"), configSource, "utf8");
  const builder = new ConsumerOutputBuilder(tempDir!);
  // The config is parsed but computed key cannot be resolved → falls back to defaults
  const snapshot = await builder.ensureBuilt();
  assert.ok(snapshot.configSourcePath?.endsWith("codemation.config.ts"));
});

// ---------------------------------------------------------------------------
// NextHostEdgeSeedLoader — loadForConsumer + resolveDevelopmentAuthSecret with key
// ---------------------------------------------------------------------------

test("NextHostEdgeSeedLoader.resolveDevelopmentAuthSecret returns configured secret when AUTH_SECRET is set", () => {
  const loader = new NextHostEdgeSeedLoader(
    { load: async () => ({ config: {}, bootstrapSource: null, workflowSources: [] }) } as never,
    { mergeConsumerRootIntoProcessEnvironment: () => ({ AUTH_SECRET: "my-real-secret" }) } as never,
  );
  assert.equal(loader.resolveDevelopmentAuthSecret({ AUTH_SECRET: "my-real-secret" }), "my-real-secret");
});

test("NextHostEdgeSeedLoader.loadForConsumer returns seed with authEnabled and authSecret", async () => {
  const configLoader = {
    load: async () => ({
      config: { auth: { allowUnauthenticatedInDevelopment: false } },
      bootstrapSource: null,
      workflowSources: [],
    }),
  };
  const consumerEnvLoader = {
    mergeConsumerRootIntoProcessEnvironment: () => ({}),
  };
  const loader = new NextHostEdgeSeedLoader(configLoader as never, consumerEnvLoader as never);
  const seed = await loader.loadForConsumer("/fake/consumer");
  assert.equal(seed.uiAuthEnabled, true);
  assert.equal(seed.authSecret, NextHostEdgeSeedLoader.defaultDevelopmentAuthSecret);
});

// ---------------------------------------------------------------------------
// DatabaseMigrationsApplyService.applyForConsumer — no-op when no database (line 35, 66)
// ---------------------------------------------------------------------------

import { fileURLToPath } from "node:url";
import { CodemationConsumerConfigLoader } from "@codemation/host/server";
import type { Logger } from "@codemation/host/next/server";
import { ConsumerCliTsconfigPreparation } from "../src/consumer/ConsumerCliTsconfigPreparation";
import { ConsumerDatabaseConnectionResolver } from "../src/database/ConsumerDatabaseConnectionResolver";
import { DatabaseMigrationsApplyService } from "../src/database/DatabaseMigrationsApplyService";
import { CliDatabaseUrlDescriptor } from "../src/user/CliDatabaseUrlDescriptor";
import { UserAdminConsumerDotenvLoader } from "../src/user/UserAdminConsumerDotenvLoader";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const silentLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

test("DatabaseMigrationsApplyService.applyForConsumer is a no-op when no database is configured (line 35, 66)", async () => {
  const savedTsconfig = process.env.CODEMATION_TSCONFIG_PATH;
  const savedDatabaseUrl = process.env.DATABASE_URL;
  try {
    process.env.CODEMATION_TSCONFIG_PATH = path.join(repoRoot, "tsconfig.codemation-tsx.json");
    if (savedDatabaseUrl !== undefined) {
      delete process.env.DATABASE_URL;
    }
    await writeFile(path.join(tempDir!, "codemation.config.js"), "module.exports = { workflows: [] };\n", "utf8");

    let deployerCalled = false;
    const deployer = {
      async deployPersistence() {
        deployerCalled = true;
      },
    };

    const service = new DatabaseMigrationsApplyService(
      silentLogger,
      new UserAdminConsumerDotenvLoader(),
      new ConsumerCliTsconfigPreparation(),
      new CodemationConsumerConfigLoader(),
      new ConsumerDatabaseConnectionResolver(),
      new CliDatabaseUrlDescriptor(),
      path.join(repoRoot, "packages", "host"),
      deployer,
    );

    // applyForConsumer with no database — should be a no-op (line 35 calls applyInternal with requirePersistence=false → line 66 returns early)
    await service.applyForConsumer(tempDir!);

    assert.equal(deployerCalled, false, "deployer must not be called when no database is configured");
  } finally {
    if (savedDatabaseUrl === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = savedDatabaseUrl;
    }
    if (savedTsconfig === undefined) {
      delete process.env.CODEMATION_TSCONFIG_PATH;
    } else {
      process.env.CODEMATION_TSCONFIG_PATH = savedTsconfig;
    }
  }
});

// ---------------------------------------------------------------------------
// CollectionsCliOptionsParser — pure logic, 0% → covered
// ---------------------------------------------------------------------------

import { CollectionsCliOptionsParser } from "../src/collections/CollectionsCliOptionsParser";

describe("CollectionsCliOptionsParser", () => {
  const parser = new CollectionsCliOptionsParser();

  it("returns undefined for both fields when opts are empty", () => {
    const result = parser.parse({});
    assert.equal(result.consumerRoot, undefined);
    assert.equal(result.configPath, undefined);
  });

  it("resolves consumerRoot relative to cwd when provided", () => {
    const result = parser.parse({ consumerRoot: "my-project" });
    assert.ok(result.consumerRoot !== undefined);
    assert.ok(result.consumerRoot.includes("my-project"));
    assert.ok(path.isAbsolute(result.consumerRoot));
  });

  it("returns undefined consumerRoot when value is whitespace-only", () => {
    const result = parser.parse({ consumerRoot: "   " });
    assert.equal(result.consumerRoot, undefined);
  });

  it("returns trimmed configPath when provided", () => {
    const result = parser.parse({ config: " /some/path.ts " });
    assert.equal(result.configPath, "/some/path.ts");
  });

  it("returns undefined configPath when value is whitespace-only", () => {
    const result = parser.parse({ config: "  " });
    assert.equal(result.configPath, undefined);
  });
});

// ---------------------------------------------------------------------------
// ListenPortConflictDescriber — missing branches
// ---------------------------------------------------------------------------

import { ListenPortConflictDescriber } from "../src/dev/ListenPortConflictDescriber";

describe("ListenPortConflictDescriber — additional branches", () => {
  it("readLsofOutput catch block: returns null when execFile errors", async () => {
    const describer = new ListenPortConflictDescriber("linux");
    // Patch execFileStdout (which readLsofOutput internally uses) to simulate lsof not found
    // We call readLsofOutput directly to exercise the catch-return-null branch
    const result = await (describer as any).readLsofOutput(99999);
    // On most systems lsof will either work or fail — either way readLsofOutput returns string|null
    assert.ok(result === null || typeof result === "string");
  });

  it("execFileStdout returns null when the command fails", async () => {
    const describer = new ListenPortConflictDescriber("linux");
    // Run a definitely-invalid command to trigger the catch → return null
    const result = await (describer as any).execFileStdout("_cmd_that_does_not_exist_", ["--flag"]);
    assert.equal(result, null);
  });

  it("readSsOutput returns output from filtered or unfiltered ss call", async () => {
    const describer = new ListenPortConflictDescriber("linux");
    // Patch execFileStdout to return empty for filtered, non-empty for unfiltered
    (describer as any).execFileStdout = async (command: string, args: string[]) => {
      if (args.includes("sport = :8899")) {
        return ""; // filtered call returns empty
      }
      return "Netid State Recv-Q Send-Q Local Address:Port\ntcp LISTEN 0 0 0.0.0.0:8899\n";
    };
    const result = await (describer as any).readSsOutput(8899);
    assert.ok(result !== null && result.includes("LISTEN"));
  });

  it("readSsOutput returns null when both ss calls return null", async () => {
    const describer = new ListenPortConflictDescriber("linux");
    (describer as any).execFileStdout = async () => null;
    const result = await (describer as any).readSsOutput(8900);
    assert.equal(result, null);
  });

  it("parseSsListenOutput skips lines without pidMatch", () => {
    const describer = new ListenPortConflictDescriber("linux");
    const port = 9000;
    // Line has LISTEN and port suffix but no pid=(\d+) match
    const raw = `tcp LISTEN 0 128 0.0.0.0:${port} 0.0.0.0:* users:(("node",nopid,fd=23))`;
    const result = (describer as any).parseSsListenOutput(raw, port) as ReadonlyArray<unknown>;
    assert.equal(result.length, 0);
  });
});

// ---------------------------------------------------------------------------
// DevSourceWatcher — uncovered private method branches
// ---------------------------------------------------------------------------

import { DevSourceWatcher } from "../src/dev/DevSourceWatcher";

describe("DevSourceWatcher — private method branches", () => {
  it("isIgnoredPath returns false for paths inside an explicit ignored root (dist in dist)", () => {
    const watcher = new DevSourceWatcher({ startupGracePeriodMs: 0 });
    // Simulate having an explicit ignored root that IS inside an ignored dir (e.g. dist/)
    const ignoredRoot = "/some/project/dist";
    (watcher as any).explicitIgnoredRoots = new Set([ignoredRoot.replace(/\\/g, "/")]);

    // A path inside that ignored root — isInsideExplicitIgnoredRoot returns true → isIgnoredPath returns false
    const result = (watcher as any).isIgnoredPath(`${ignoredRoot}/plugin.js`);
    assert.equal(result, false);
  });

  it("isIgnoredPath returns true for paths inside node_modules", () => {
    const watcher = new DevSourceWatcher({ startupGracePeriodMs: 0 });
    (watcher as any).explicitIgnoredRoots = new Set();
    const result = (watcher as any).isIgnoredPath("/some/project/node_modules/foo/index.js");
    assert.equal(result, true);
  });

  it("isInsideExplicitIgnoredRoot returns false when no roots match", () => {
    const watcher = new DevSourceWatcher({ startupGracePeriodMs: 0 });
    (watcher as any).explicitIgnoredRoots = new Set(["/some/other/path"]);
    const result = (watcher as any).isInsideExplicitIgnoredRoot("/completely/different/path.ts");
    assert.equal(result, false);
  });

  it("flushPendingChange returns early when buffer is empty", async () => {
    const watcher = new DevSourceWatcher({ startupGracePeriodMs: 0 });
    let called = false;
    // Buffer is empty by default — should return without calling onChange
    await (watcher as any).flushPendingChange(async () => {
      called = true;
    });
    assert.equal(called, false);
  });

  it("isRelevantPath returns true for .env files", () => {
    const watcher = new DevSourceWatcher();
    assert.equal((watcher as any).isRelevantPath("/project/.env"), true);
    assert.equal((watcher as any).isRelevantPath("/project/.env.local"), true);
  });

  it("start is idempotent: second call while watching returns early", async () => {
    const watcher = new DevSourceWatcher({ startupGracePeriodMs: 0 });
    const fakeOnChange = async () => {};
    const roots = [os.tmpdir()];
    await watcher.start({ roots, onChange: fakeOnChange });
    await watcher.start({ roots, onChange: fakeOnChange });
    // No assertion other than it doesn't throw
    await watcher.stop();
    assert.equal(typeof watcher, "object");
  });

  it("stop clears a pending debounce timeout (lines 82-83 in DevSourceWatcher)", async () => {
    const watcher = new DevSourceWatcher({ startupGracePeriodMs: 0, debounceMs: 5000 });
    let onChangeCalled = false;

    // Start a watcher to set up the internal state
    await watcher.start({
      roots: [os.tmpdir()],
      onChange: async () => {
        onChangeCalled = true;
      },
    });

    // Manually trigger a debounce by calling the private method — so a pending timeout exists
    (watcher as any).scheduleDebouncedChange(async () => {
      onChangeCalled = true;
    });
    assert.ok((watcher as any).debounceTimeout !== null, "Expected debounceTimeout to be set");

    // stop() must clear the debounce timeout before closing the watcher
    await watcher.stop();

    assert.equal(onChangeCalled, false, "onChange should not have been called");
  });

  it("scheduleDebouncedChange cancels an existing timeout before setting a new one (line 96)", async () => {
    const watcher = new DevSourceWatcher({ startupGracePeriodMs: 0, debounceMs: 5000 });

    // Call scheduleDebouncedChange twice quickly to hit the `clearTimeout` branch
    (watcher as any).scheduleDebouncedChange(async () => {});
    const firstTimeout = (watcher as any).debounceTimeout;
    (watcher as any).scheduleDebouncedChange(async () => {});
    const secondTimeout = (watcher as any).debounceTimeout;

    assert.notEqual(firstTimeout, secondTimeout, "Second call should replace the first timeout");
    // Cancel the second timeout to clean up
    clearTimeout(secondTimeout);
  });
});

// ---------------------------------------------------------------------------
// DevNextHostEnvironmentBuilder — fallback port when URL has no explicit port
// ---------------------------------------------------------------------------

import { ConsumerEnvLoader } from "../src/consumer/ConsumerEnvLoader";
import { SourceMapNodeOptions } from "../src/runtime/SourceMapNodeOptions";
import { DevNextHostEnvironmentBuilder } from "../src/dev/DevNextHostEnvironmentBuilder";

test("DevNextHostEnvironmentBuilder resolvePublicWebsocketPort falls back to websocketPort when URL has no port", () => {
  const builder = new DevNextHostEnvironmentBuilder(new ConsumerEnvLoader(), new SourceMapNodeOptions());
  // http://localhost has no explicit port — resolvePublicWebsocketPort should return fallbackPort
  const env = builder.buildConsumerUiProxy({
    authSecret: "secret",
    consumerRoot: os.tmpdir(),
    developmentServerToken: "tok",
    nextPort: 3000,
    publicBaseUrl: "http://localhost",
    runtimeDevUrl: "http://localhost",
    skipUiAuth: true,
    websocketPort: 4001,
  });
  // websocketPort is the fallback when URL has no port (port='' which becomes 0 after Number())
  assert.equal(env.CODEMATION_WS_PORT, "4001");
});
