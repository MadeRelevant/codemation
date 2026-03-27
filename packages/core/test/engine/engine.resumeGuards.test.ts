import assert from "node:assert/strict";
import { test } from "vitest";

import { CallbackNodeConfig, chain, createEngineTestKit, items } from "../harness/index.ts";

test("resume rejects stale activation ids after a pending run was created", async () => {
  const A = new CallbackNodeConfig("A", () => {}, {
    id: "A",
    execution: { hint: "worker", queue: "q.default" },
  });
  const workflow = chain({ id: "wf.resume.guard", name: "Resume guard" }).start(A).build();
  const kit = createEngineTestKit();

  await kit.start([workflow]);

  const scheduled = await kit.engine.runWorkflow(workflow, "A", items([{ ok: true }]));
  assert.equal(scheduled.status, "pending");

  await assert.rejects(
    () =>
      kit.engine.resumeFromStepResult({
        runId: scheduled.runId,
        activationId: "stale_activation",
        nodeId: "A",
        outputs: { main: items([{ ok: true }]) },
      }),
    /activationId mismatch/,
  );
});
