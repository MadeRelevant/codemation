import assert from "node:assert/strict";
import { test } from "vitest";

import { EngineExecutionLimitsPolicy } from "../../src/policies/executionLimits/EngineExecutionLimitsPolicy.ts";

test("createRootExecutionOptions matches mergeExecutionOptionsForNewRun(undefined, undefined) on the same policy", () => {
  const policy = new EngineExecutionLimitsPolicy();
  assert.deepStrictEqual(
    policy.createRootExecutionOptions(),
    policy.mergeExecutionOptionsForNewRun(undefined, undefined),
  );
});
