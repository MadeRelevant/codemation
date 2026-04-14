import assert from "node:assert/strict";
import { test } from "vitest";
import "reflect-metadata";

import type { Item } from "../src/index.ts";
import { defineNode } from "../src/index.ts";
import { WorkflowBuilder } from "../src/workflow/dsl/WorkflowBuilder";
import { CallbackNodeConfig, items } from "./harness/index.ts";
import { WorkflowTestKit } from "../src/testing/WorkflowTestKitBuilder.ts";

const testKitDefineNodeSample = defineNode({
  key: "testkit.workflow.sample",
  title: "WorkflowTestKit sample",
  input: {
    field: "string",
  },
  execute(
    { input }: { readonly input: Readonly<Record<string, unknown>> },
    { config }: { readonly config: Readonly<{ field: string }> },
  ) {
    return {
      ...input,
      [config.field]: String(input[config.field] ?? "").toUpperCase(),
    };
  },
});

class WorkflowTestBinaryFactory {
  static itemWithBinary(): Item<Readonly<{ message: string }>> {
    return {
      json: { message: "ab" },
      binary: {
        attachment: {
          id: "att-1",
          storageKey: "storage/att-1",
          mimeType: "text/plain",
          size: 2,
          storageDriver: "memory",
          previewKind: "download",
          createdAt: new Date().toISOString(),
          runId: "run-1",
          workflowId: "wf-1",
          nodeId: "n0",
          activationId: "a0",
          filename: "note.txt",
        },
      } as never,
    };
  }
}

test("WorkflowTestKit.run executes a multi-node workflow to completion", async () => {
  const events: string[] = [];
  const a = new CallbackNodeConfig("A", () => events.push("A"), { id: "A" });
  const b = new CallbackNodeConfig("B", () => events.push("B"), { id: "B" });
  const wf = new WorkflowBuilder({ id: "wf.testkit.chain", name: "TestKit chain" }).start(a).then(b).build();

  const kit = new WorkflowTestKit();
  const result = await kit.run({
    workflow: wf,
    items: items([{ n: 1 }]),
    startAt: "A",
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(
    result.outputs.map((o) => o.json),
    [{ n: 1 }],
  );
  assert.equal(events.join(","), "A,B");
});

test("WorkflowTestKit.registerDefinedNodes wires defineNode implementations", async () => {
  const kit = new WorkflowTestKit();
  kit.registerDefinedNodes([testKitDefineNodeSample]);
  const node = testKitDefineNodeSample.create({ field: "message" }, "Sample", "n1");
  const result = await kit.runNode({
    node,
    items: items([{ message: "ab" }]),
    workflowId: "wf.testkit.defined",
    workflowName: "defined node",
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(
    result.outputs.map((o) => o.json),
    [{ message: "AB" }],
  );
});

test("WorkflowTestKit.runNode runs a single runnable node after the harness trigger", async () => {
  const events: string[] = [];
  const node = new CallbackNodeConfig("Only", () => events.push("run"), { id: "only" });
  const kit = new WorkflowTestKit();
  const result = await kit.runNode({
    node,
    items: items([{ x: "a" }]),
    workflowId: "wf.testkit.runNode",
    workflowName: "runNode",
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(
    result.outputs.map((o) => o.json),
    [{ x: "a" }],
  );
  assert.deepEqual(events, ["run"]);
});

test("WorkflowTestKit.runNode preserves input binary for defineNode helpers with keepBinaries enabled", async () => {
  const binaryKeepingNode = defineNode({
    key: "testkit.workflow.keepBinaries",
    title: "Keep binaries",
    input: {
      field: "string",
    },
    keepBinaries: true,
    execute(
      { input }: { readonly input: Readonly<Record<string, unknown>> },
      { config }: { readonly config: Readonly<{ field: string }> },
    ) {
      return {
        [config.field]: String(input.message ?? "").toUpperCase(),
      };
    },
  });

  const kit = new WorkflowTestKit();
  kit.registerDefinedNodes([binaryKeepingNode]);
  const node = binaryKeepingNode.create({ field: "message" }, "Keep binaries", "n-keep");
  const inputItem = WorkflowTestBinaryFactory.itemWithBinary();
  const result = await kit.runNode({
    node,
    items: [inputItem],
    workflowId: "wf.testkit.keep-binaries",
    workflowName: "keep binaries",
  });

  assert.equal(result.status, "completed");
  assert.deepEqual(
    result.outputs.map((o) => o.json),
    [{ message: "AB" }],
  );
  assert.deepEqual(result.outputs[0]?.binary, inputItem.binary);
});
