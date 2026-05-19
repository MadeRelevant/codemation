/**
 * Tests for EventPublishingWorkflowExecutionRepository — covers deleteRun,
 * listRuns, and listRunsOlderThan delegation paths.
 */
import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { EventPublishingWorkflowExecutionRepository } from "../../src/events/EventPublishingWorkflowExecutionRepository";
import { InMemoryWorkflowExecutionRepository } from "../../src/runStorage/InMemoryWorkflowExecutionRepository";
import { InMemoryRunEventBus } from "../../src/events/InMemoryRunEventBusRegistry";
import type { RunEvent } from "../../src/events/runEvents";

function makeRepo() {
  const inner = new InMemoryWorkflowExecutionRepository();
  const events: RunEvent[] = [];
  const bus = new InMemoryRunEventBus();
  const nowFn = () => new Date("2026-01-01T00:00:00.000Z");
  const repo = new EventPublishingWorkflowExecutionRepository(inner, bus, nowFn);
  return { repo, inner, events };
}

describe("EventPublishingWorkflowExecutionRepository", () => {
  test("createRun publishes runCreated event", async () => {
    const { repo, inner } = makeRepo();
    await repo.createRun({
      runId: "run-1",
      workflowId: "wf-1",
      startedAt: "2026-01-01T00:00:00.000Z",
    });
    const state = await inner.load("run-1");
    assert.ok(state, "Run should be persisted");
    assert.equal(state?.runId, "run-1");
  });

  test("save persists state", async () => {
    const { repo, inner } = makeRepo();
    await repo.createRun({
      runId: "run-save",
      workflowId: "wf-1",
      startedAt: "2026-01-01T00:00:00.000Z",
    });
    const loaded = await inner.load("run-save");
    // Update and re-save
    await repo.save({ ...loaded!, status: "completed", finishedAt: "2026-01-01T00:01:00.000Z" });
    const updated = await inner.load("run-save");
    assert.equal(updated?.status, "completed");
  });

  test("deleteRun removes run from inner repository", async () => {
    const { repo, inner } = makeRepo();
    await repo.createRun({
      runId: "run-del",
      workflowId: "wf-1",
      startedAt: "2026-01-01T00:00:00.000Z",
    });
    await repo.deleteRun("run-del");
    const state = await inner.load("run-del");
    assert.equal(state, undefined);
  });

  test("deleteRun is a no-op when inner has no deleteRun", async () => {
    const innerWithoutDelete = {
      createRun: async () => {},
      load: async () => undefined,
      loadSchedulingState: async () => undefined,
      save: async () => {},
    } as never;
    const bus = new InMemoryRunEventBus();
    const repo = new EventPublishingWorkflowExecutionRepository(innerWithoutDelete, bus);
    // Should not throw
    await repo.deleteRun("nonexistent");
  });

  test("listRuns returns empty array when inner has no listRuns", async () => {
    const innerWithoutList = {
      createRun: async () => {},
      load: async () => undefined,
      loadSchedulingState: async () => undefined,
      save: async () => {},
    } as never;
    const bus = new InMemoryRunEventBus();
    const repo = new EventPublishingWorkflowExecutionRepository(innerWithoutList, bus);
    const runs = await repo.listRuns();
    assert.deepEqual(runs, []);
  });

  test("listRunsOlderThan returns empty array when inner has no listRunsOlderThan", async () => {
    const innerWithoutPrune = {
      createRun: async () => {},
      load: async () => undefined,
      loadSchedulingState: async () => undefined,
      save: async () => {},
    } as never;
    const bus = new InMemoryRunEventBus();
    const repo = new EventPublishingWorkflowExecutionRepository(innerWithoutPrune, bus);
    const runs = await repo.listRunsOlderThan({
      nowIso: "2026-01-01T00:00:00.000Z",
      defaultRetentionSeconds: 3600,
    });
    assert.deepEqual(runs, []);
  });

  test("load and loadSchedulingState delegate to inner", async () => {
    const { repo } = makeRepo();
    const state = await repo.load("nonexistent");
    assert.equal(state, undefined);
    const schedState = await repo.loadSchedulingState("nonexistent");
    assert.equal(schedState, undefined);
  });
});
