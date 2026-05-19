import assert from "node:assert/strict";
import { test } from "vitest";

import { MissingRuntimeTrigger } from "../../src/workflowSnapshots/MissingRuntimeTrigger";
import { MissingRuntimeTriggerConfig } from "../../src/workflowSnapshots/MissingRuntimeTriggerConfig";

test("MissingRuntimeTrigger.kind is 'trigger'", () => {
  const trigger = new MissingRuntimeTrigger();
  assert.equal(trigger.kind, "trigger");
});

test("MissingRuntimeTrigger.setup resolves to undefined", async () => {
  const trigger = new MissingRuntimeTrigger();
  const result = await trigger.setup({} as never);
  assert.equal(result, undefined);
});

test("MissingRuntimeTrigger.execute passes items through on main port", async () => {
  const trigger = new MissingRuntimeTrigger();
  const items = [{ json: { x: 1 } }];
  const result = await trigger.execute(items);
  assert.deepEqual(result, { main: items });
});

test("MissingRuntimeTriggerConfig stores constructor fields", () => {
  const config = new MissingRuntimeTriggerConfig("webhook", "trigger.http", true);
  assert.equal(config.name, "webhook");
  assert.equal(config.missingTokenId, "trigger.http");
  assert.equal(config.missingRuntime, true);
  assert.equal(config.kind, "trigger");
});
