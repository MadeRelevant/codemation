import test from "node:test";
import assert from "node:assert/strict";
import type { NodeExecutionContext } from "@codemation/core";
import { DefaultExecutionBinaryService, InMemoryBinaryStorage, InMemoryRunDataFactory } from "@codemation/core";
import { ManualTrigger, ManualTriggerNode } from "../dist/index.js";

class ManualTriggerExecutionContextFactory {
  static create(config: ManualTrigger<any>): NodeExecutionContext<ManualTrigger<any>> {
    const binary = new DefaultExecutionBinaryService(new InMemoryBinaryStorage(), "wf.manual.execute", "run_manual_execute", () =>
      new Date("2026-03-17T12:00:00.000Z"),
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

  assert.deepEqual(outputs.main?.map((item) => item.json), [{ seeded: true }]);
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

  assert.deepEqual(outputs.main?.map((item) => item.json), [{ manual: true }]);
});
