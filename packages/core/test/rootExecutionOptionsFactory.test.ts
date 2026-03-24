import assert from "node:assert/strict";
import { test } from "vitest";

import { EngineExecutionLimitsPolicy } from "../src/engine/application/policies/EngineExecutionLimitsPolicy.ts";
import { RootExecutionOptionsFactory } from "../src/engine/application/policies/RootExecutionOptionsFactory.ts";

test("create matches mergeExecutionOptionsForNewRun(undefined, undefined) on the same policy", () => {
  const policy = new EngineExecutionLimitsPolicy();
  const factory = new RootExecutionOptionsFactory(policy);
  assert.deepStrictEqual(factory.create(), policy.mergeExecutionOptionsForNewRun(undefined, undefined));
});
