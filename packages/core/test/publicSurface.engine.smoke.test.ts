import assert from "node:assert/strict";
import { test } from "vitest";

import { CoreTokens, RunIntentService } from "../src/index.ts";
import * as coreMain from "../src/index.ts";
import { Engine, EngineFactory, EngineRuntimeRegistrar } from "../src/bootstrap/index.ts";
import { InMemoryLiveWorkflowRepository } from "../src/testing.ts";

test("public main surface exposes stable workflow/runtime boundary types only", () => {
  assert.ok(!("EngineRuntimeRegistrar" in coreMain));
  assert.equal(typeof RunIntentService, "function");
  assert.equal(typeof CoreTokens.LiveWorkflowRepository, "symbol");
  assert.ok(new InMemoryLiveWorkflowRepository());
});

test("bootstrap owns composition-root and runtime wiring types", () => {
  assert.ok(!("Engine" in coreMain));
  assert.ok(!("EngineFactory" in coreMain));
  assert.ok(!("EngineRuntimeRegistrar" in coreMain));
  assert.equal(typeof Engine, "function");
  assert.equal(typeof EngineFactory, "function");
  assert.equal(typeof EngineRuntimeRegistrar, "function");
});
