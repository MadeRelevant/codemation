import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "vitest";
import type { WorkflowDefinition } from "@codemation/core";
import type { WorkflowModuleImporter } from "../../../src/workflows/discovery/WorkflowDirectoryDiscoverer";
import { WorkflowDirectoryDiscoverer } from "../../../src/workflows/discovery/WorkflowDirectoryDiscoverer";

const baseTmpDir = path.join(tmpdir(), "wdd-tests");
let testCounter = 0;

function minimalWorkflow(id: string): WorkflowDefinition {
  return { id, name: id, nodes: [], edges: [] };
}

function recordingImporter(fileMap: ReadonlyMap<string, Readonly<Record<string, unknown>>>): WorkflowModuleImporter {
  return async (absolutePath: string) => {
    return fileMap.get(absolutePath) ?? {};
  };
}

describe("WorkflowDirectoryDiscoverer", () => {
  let tmpDir: string;

  beforeEach(async () => {
    testCounter += 1;
    tmpDir = path.join(baseTmpDir, `test-${testCounter}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  test("happy path — discovers exported workflows from ts files", async () => {
    const workflowsDir = path.join(tmpDir, "workflows");
    await mkdir(workflowsDir);
    const wfFile = path.join(workflowsDir, "hello.ts");
    await writeFile(wfFile, "// stub");

    const wf = minimalWorkflow("hello");
    const importer = recordingImporter(new Map([[wfFile, { default: wf }]]));
    const discoverer = new WorkflowDirectoryDiscoverer(importer);

    const result = await discoverer.discover({ consumerRoot: tmpDir, workflowsDir: "workflows" });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, "hello");
  });

  test("empty directory — returns empty array without error", async () => {
    const workflowsDir = path.join(tmpDir, "workflows");
    await mkdir(workflowsDir);

    const discoverer = new WorkflowDirectoryDiscoverer(async () => ({}));

    const result = await discoverer.discover({ consumerRoot: tmpDir, workflowsDir: "workflows" });
    assert.deepEqual(result, []);
  });

  test("non-existent directory — returns empty array without error", async () => {
    const discoverer = new WorkflowDirectoryDiscoverer(async () => ({}));

    const result = await discoverer.discover({ consumerRoot: tmpDir, workflowsDir: "does-not-exist" });
    assert.deepEqual(result, []);
  });

  test("nested directories — discovers workflows in subdirectories", async () => {
    const workflowsDir = path.join(tmpDir, "workflows");
    const subDir = path.join(workflowsDir, "sub");
    await mkdir(subDir, { recursive: true });
    const wfFile = path.join(subDir, "nested.ts");
    await writeFile(wfFile, "// stub");

    const wf = minimalWorkflow("nested");
    const importer = recordingImporter(new Map([[wfFile, { default: wf }]]));
    const discoverer = new WorkflowDirectoryDiscoverer(importer);

    const result = await discoverer.discover({ consumerRoot: tmpDir, workflowsDir: "workflows" });
    assert.equal(result.length, 1);
    assert.equal(result[0]?.id, "nested");
  });

  test("dedup by id — last writer wins when two files export the same workflow id", async () => {
    const workflowsDir = path.join(tmpDir, "workflows");
    await mkdir(workflowsDir);
    const fileA = path.join(workflowsDir, "a.ts");
    const fileB = path.join(workflowsDir, "b.ts");
    // Write files so they exist on disk (required for readdir to find them)
    await writeFile(fileA, "// stub");
    await writeFile(fileB, "// stub");

    const wfA = { ...minimalWorkflow("dup"), name: "from-a" };
    const wfB = { ...minimalWorkflow("dup"), name: "from-b" };
    // File ordering is alphabetical (a.ts before b.ts), so b wins
    const importer = recordingImporter(
      new Map([
        [fileA, { default: wfA }],
        [fileB, { default: wfB }],
      ]),
    );
    const discoverer = new WorkflowDirectoryDiscoverer(importer);

    const result = await discoverer.discover({ consumerRoot: tmpDir, workflowsDir: "workflows" });
    assert.equal(result.length, 1);
    // b.ts is last alphabetically, so it overwrites a.ts in the Map
    assert.equal(result[0]?.name, "from-b");
  });

  test("file with no workflow export — ignored gracefully", async () => {
    const workflowsDir = path.join(tmpDir, "workflows");
    await mkdir(workflowsDir);
    const wfFile = path.join(workflowsDir, "helpers.ts");
    await writeFile(wfFile, "// stub");

    const importer = recordingImporter(new Map([[wfFile, { someHelper: () => undefined }]]));
    const discoverer = new WorkflowDirectoryDiscoverer(importer);

    const result = await discoverer.discover({ consumerRoot: tmpDir, workflowsDir: "workflows" });
    assert.deepEqual(result, []);
  });

  test("test files are excluded from discovery", async () => {
    const workflowsDir = path.join(tmpDir, "workflows");
    await mkdir(workflowsDir);
    const testFile = path.join(workflowsDir, "hello.test.ts");
    const specFile = path.join(workflowsDir, "hello.spec.ts");
    const wfFile = path.join(workflowsDir, "hello.ts");
    await writeFile(testFile, "// stub");
    await writeFile(specFile, "// stub");
    await writeFile(wfFile, "// stub");

    const wf = minimalWorkflow("hello");
    // Only the non-test file should be imported
    const importedPaths: string[] = [];
    const importer: WorkflowModuleImporter = async (p) => {
      importedPaths.push(p);
      return p === wfFile ? { default: wf } : {};
    };
    const discoverer = new WorkflowDirectoryDiscoverer(importer);

    const result = await discoverer.discover({ consumerRoot: tmpDir, workflowsDir: "workflows" });
    assert.equal(result.length, 1);
    // test and spec files must not be imported
    assert.ok(!importedPaths.includes(testFile), "test file should not be imported");
    assert.ok(!importedPaths.includes(specFile), "spec file should not be imported");
  });

  test("multiple exports in one file — all workflow-shaped exports are registered", async () => {
    const workflowsDir = path.join(tmpDir, "workflows");
    await mkdir(workflowsDir);
    const wfFile = path.join(workflowsDir, "multi.ts");
    await writeFile(wfFile, "// stub");

    const wf1 = minimalWorkflow("multi-one");
    const wf2 = minimalWorkflow("multi-two");
    const importer = recordingImporter(new Map([[wfFile, { wf1, wf2, helper: "string" }]]));
    const discoverer = new WorkflowDirectoryDiscoverer(importer);

    const result = await discoverer.discover({ consumerRoot: tmpDir, workflowsDir: "workflows" });
    assert.equal(result.length, 2);
    const ids = result.map((w) => w.id).sort();
    assert.deepEqual(ids, ["multi-one", "multi-two"]);
  });
});
