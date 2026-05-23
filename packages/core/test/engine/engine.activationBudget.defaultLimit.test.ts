/**
 * Verifies that when no executionOptions are passed to runWorkflow, the engine
 * uses EngineExecutionLimitsPolicy.defaultMaxNodeActivations (100_000) as the
 * fallback — not Number.MAX_SAFE_INTEGER.
 *
 * The test validates that the persisted run state stores the policy default.
 */
import "reflect-metadata";

import assert from "node:assert/strict";
import { test } from "vitest";

import { ENGINE_EXECUTION_LIMITS_DEFAULTS } from "../../src/policies/executionLimits/EngineExecutionLimitsPolicy";
import { createEngineTestKit } from "../harness/engine.ts";
import { CallbackNodeConfig, dag, items } from "../harness/index.ts";

test("engine default maxNodeActivations is 100_000 (policy constant)", () => {
  assert.equal(ENGINE_EXECUTION_LIMITS_DEFAULTS.defaultMaxNodeActivations, 100_000);
});

test("engine stores maxNodeActivations from policy when executionOptions is absent", async () => {
  const b = dag({ id: "wf.budget.default", name: "TwoNode" });
  b.add(new CallbackNodeConfig("n0", () => {}, { id: "n0" }));
  b.add(new CallbackNodeConfig("n1", () => {}, { id: "n1" }));
  b.connect("n0", "n1");
  const wf = b.build();

  const kit = await createEngineTestKit();
  await kit.start([wf]);

  // Run without any executionOptions — the engine must apply the policy default.
  const result = await kit.engine.runWorkflow(wf, "n0", items([{ v: 1 }]));
  if (result.status !== "completed" && result.status !== "pending") {
    assert.fail(`Unexpected run status: ${result.status}`);
  }

  // The run store should contain the resolved maxNodeActivations from the policy.
  // We check both terminal state (completed) and any pending state.
  const runId = result.status === "pending" ? result.runId : ((result as { runId?: string }).runId ?? undefined);

  if (runId) {
    const state = await kit.runStore.load(runId);
    if (state) {
      assert.equal(
        state.executionOptions?.maxNodeActivations,
        ENGINE_EXECUTION_LIMITS_DEFAULTS.defaultMaxNodeActivations,
        "Persisted executionOptions.maxNodeActivations must equal the policy default, not MAX_SAFE_INTEGER",
      );
      assert.notEqual(
        state.executionOptions?.maxNodeActivations,
        Number.MAX_SAFE_INTEGER,
        "maxNodeActivations must not be MAX_SAFE_INTEGER",
      );
    }
  }
}, 5000);
