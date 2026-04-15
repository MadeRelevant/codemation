import assert from "node:assert/strict";
import { test } from "vitest";
import "reflect-metadata";

import { itemExpr } from "@codemation/core";
import { WorkflowTestKit } from "@codemation/core/testing";

import { examplePluginUppercaseNode } from "../src/nodes/ExamplePluginUppercase";

test("example uppercase node uppercases the configured field", async () => {
  const kit = new WorkflowTestKit();
  kit.registerDefinedNodes([examplePluginUppercaseNode]);
  const node = examplePluginUppercaseNode.create(
    {
      field: itemExpr(() => "message"),
    },
    "Uppercase",
    "upper",
  );
  const result = await kit.runNode({
    node,
    items: [{ json: { message: "hello" } }],
    workflowId: "wf.plugin.example.uppercase",
    workflowName: "Plugin uppercase example",
  });
  assert.equal(result.status, "completed");
  assert.deepEqual(
    result.outputs.map((item) => item.json),
    [{ message: "HELLO" }],
  );
});
