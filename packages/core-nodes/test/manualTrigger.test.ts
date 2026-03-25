import type { NodeExecutionContext, TriggerTestItemsContext } from "@codemation/core";
import { DefaultExecutionBinaryService, InMemoryBinaryStorage, InMemoryRunDataFactory } from "@codemation/core";
import assert from "node:assert/strict";
import { test } from "vitest";
import { ManualTrigger, ManualTriggerNode } from "../src/index.ts";

class ManualTriggerExecutionContextFactory {
  static create(config: ManualTrigger<any>): NodeExecutionContext<ManualTrigger<any>> {
    const binary = new DefaultExecutionBinaryService(
      new InMemoryBinaryStorage(),
      "wf.manual.execute",
      "run_manual_execute",
      () => new Date("2026-03-17T12:00:00.000Z"),
    );
    return {
      runId: "run_manual_execute",
      workflowId: "wf.manual.execute",
      nodeId: "trigger",
      activationId: "act_manual_execute",
      now: () => new Date("2026-03-17T12:00:00.000Z"),
      data: new InMemoryRunDataFactory().create(),
      parent: undefined,
      binary: binary.forNode({ nodeId: "trigger", activationId: "act_manual_execute" }),
      config,
    };
  }

  static createTestItems(config: ManualTrigger<any>): TriggerTestItemsContext<ManualTrigger<any>> {
    const executionContext = this.create(config);
    return {
      runId: executionContext.runId,
      workflowId: executionContext.workflowId,
      now: executionContext.now,
      data: executionContext.data,
      parent: executionContext.parent,
      binary: executionContext.binary,
      trigger: {
        workflowId: executionContext.workflowId,
        nodeId: executionContext.nodeId,
      },
      nodeId: executionContext.nodeId,
      config,
      previousState: undefined,
    };
  }
}

test("manual trigger falls back to configured default items when invoked without input", async () => {
  const node = new ManualTriggerNode();
  const outputs = await node.execute(
    [],
    ManualTriggerExecutionContextFactory.create(
      new ManualTrigger("Manual trigger", [
        {
          json: {
            seeded: true,
          },
        },
      ]),
    ),
  );

  assert.deepEqual(
    outputs.main?.map((item) => item.json),
    [{ seeded: true }],
  );
});

test("manual trigger normalizes a single json object as default input", async () => {
  const node = new ManualTriggerNode();
  const outputs = await node.execute(
    [],
    ManualTriggerExecutionContextFactory.create(new ManualTrigger("Manual trigger", { seeded: true })),
  );

  assert.deepEqual(
    outputs.main?.map((item) => item.json),
    [{ seeded: true }],
  );
});

test("manual trigger normalizes an array of json objects as default input", async () => {
  const node = new ManualTriggerNode();
  const outputs = await node.execute(
    [],
    ManualTriggerExecutionContextFactory.create(new ManualTrigger("Manual trigger", [{ seeded: 1 }, { seeded: 2 }])),
  );

  assert.deepEqual(
    outputs.main?.map((item) => item.json),
    [{ seeded: 1 }, { seeded: 2 }],
  );
});

test("manual trigger prefers provided execution items over configured defaults", async () => {
  const node = new ManualTriggerNode();
  const outputs = await node.execute(
    [
      {
        json: {
          manual: true,
        },
      },
    ],
    ManualTriggerExecutionContextFactory.create(
      new ManualTrigger("Manual trigger", [
        {
          json: {
            seeded: true,
          },
        },
      ]),
    ),
  );

  assert.deepEqual(
    outputs.main?.map((item) => item.json),
    [{ manual: true }],
  );
});

test("manual trigger defaults continueWhenEmptyOutput to true", () => {
  const config = new ManualTrigger("Manual trigger");
  assert.equal(config.continueWhenEmptyOutput, true);
});

test("manual trigger exposes configured default items through getTestItems", async () => {
  const node = new ManualTriggerNode();
  const outputs = await node.getTestItems(
    ManualTriggerExecutionContextFactory.createTestItems(
      new ManualTrigger("Manual trigger", [
        {
          json: {
            seeded: true,
          },
        },
      ]),
    ),
  );

  assert.deepEqual(
    outputs.map((item) => item.json),
    [{ seeded: true }],
  );
});
