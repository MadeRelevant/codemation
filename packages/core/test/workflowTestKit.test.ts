import assert from "node:assert/strict";
import { test } from "vitest";
import "reflect-metadata";

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
  run(
    items: ReadonlyArray<Readonly<Record<string, unknown>>>,
    { config }: { readonly config: Readonly<{ field: string }> },
  ) {
    return items.map((item) => ({
      ...item,
      [config.field]: String(item[config.field] ?? "").toUpperCase(),
    }));
  },
});

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
