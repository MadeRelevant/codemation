import assert from "node:assert/strict";
import { test } from "vitest";

import { RuntimeDevMetrics } from "../src/RuntimeDevMetrics";

test("recordReload and recordEngineSwap append bounded samples", () => {
  const metrics = new RuntimeDevMetrics();
  for (let index = 0; index < 60; index += 1) {
    metrics.recordReload(index);
    metrics.recordEngineSwap(index + 1);
  }
  const snapshot = metrics.getSnapshot();
  assert.equal(snapshot.reloadCount, 60);
  assert.equal(snapshot.reloadDurationsMs.length, 50);
  assert.equal(snapshot.engineSwapDurationsMs.length, 50);
  assert.equal(snapshot.reloadDurationsMs[0], 10);
  assert.equal(snapshot.reloadDurationsMs[snapshot.reloadDurationsMs.length - 1], 59);
  assert.ok(snapshot.memoryUsage.heapUsed > 0);
});
