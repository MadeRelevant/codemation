import assert from "node:assert/strict";
import { test } from "vitest";

import { CallbackNodeConfig, MergeNodeConfig, createEngineTestKit, dag, items } from "../harness/index.ts";

/**
 * Engine-level mirror of `currentStateFrontierPlanner.test.ts` "collect queue entry when merge inputs are satisfied".
 */
test("engine runs merge collect when both branch outputs already exist in current state", async () => {
  const A = new CallbackNodeConfig("A", () => {}, { id: "A" });
  const B = new CallbackNodeConfig("B", () => {}, { id: "B" });
  const merge = new MergeNodeConfig("Merge", { mode: "append" }, { id: "merge" });

  const builder = dag({ id: "wf.engine.merge.collect", name: "merge collect engine" });
  builder.add(A);
  builder.add(B);
  builder.add(merge);
  builder.connect("A", "merge", "main", "left");
  builder.connect("B", "merge", "main", "right");
  const wf = builder.build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const scheduled = await kit.engine.runWorkflowFromState({
    workflow: wf,
    items: [],
    currentState: {
      outputsByNode: {
        A: { main: items([{ from: "A" }]) },
        B: { main: items([{ from: "B" }]) },
      },
      nodeSnapshotsByNodeId: {},
    },
    stopCondition: { kind: "workflowCompleted" },
  });

  const done = scheduled.status === "pending" ? await kit.engine.waitForCompletion(scheduled.runId) : scheduled;
  assert.equal(done.status, "completed");
  assert.deepEqual(
    done.outputs.map((i) => i.json),
    [{ from: "A" }, { from: "B" }],
  );
});
