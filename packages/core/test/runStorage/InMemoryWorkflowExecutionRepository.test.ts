import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { InMemoryWorkflowExecutionRepository } from "../../src/runStorage/InMemoryWorkflowExecutionRepository";

describe("InMemoryWorkflowExecutionRepository", () => {
  describe("loadSchedulingState", () => {
    it("returns undefined for unknown run", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      const result = await repo.loadSchedulingState("no-such-run");
      assert.equal(result, undefined);
    });

    it("returns scheduling state for a known run (no pending)", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      await repo.createRun({ runId: "run-1", workflowId: "wf-1", startedAt: "2024-01-01T00:00:00.000Z" });
      const state = await repo.loadSchedulingState("run-1");
      assert.ok(state, "expected scheduling state");
      assert.equal(state.pending, undefined);
      assert.deepEqual(state.queue, []);
    });

    it("returns a copy of pending and queue, not the original references", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      await repo.createRun({ runId: "run-snap", workflowId: "wf-snap", startedAt: "2024-01-01T00:00:00.000Z" });
      const run = await repo.load("run-snap");
      assert.ok(run);
      // Mutate the run to add queue entries and a pending field
      const queueEntry = { nodeId: "n1", activationId: "a1", input: {}, outputsByNode: {} } as any;
      const pendingEntry = { nodeId: "n2", activationId: "a2", input: {}, outputsByNode: {} } as any;
      await repo.save({ ...run, queue: [queueEntry], pending: pendingEntry });

      const state = await repo.loadSchedulingState("run-snap");
      assert.ok(state);
      assert.equal(state.queue.length, 1);
      // Confirm it's a shallow copy (different reference)
      assert.notEqual(state.queue, (await repo.load("run-snap"))?.queue);
    });
  });

  describe("listRuns", () => {
    it("returns all runs when no filter is provided", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      await repo.createRun({ runId: "r1", workflowId: "wf-a", startedAt: "2024-01-01T00:00:00.000Z" });
      await repo.createRun({ runId: "r2", workflowId: "wf-b", startedAt: "2024-01-02T00:00:00.000Z" });
      const runs = await repo.listRuns();
      assert.equal(runs.length, 2);
    });

    it("filters by workflowId", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      await repo.createRun({ runId: "r1", workflowId: "wf-a", startedAt: "2024-01-01T00:00:00.000Z" });
      await repo.createRun({ runId: "r2", workflowId: "wf-b", startedAt: "2024-01-02T00:00:00.000Z" });
      await repo.createRun({ runId: "r3", workflowId: "wf-a", startedAt: "2024-01-03T00:00:00.000Z" });
      const runs = await repo.listRuns({ workflowId: "wf-a" });
      assert.equal(runs.length, 2);
      assert.ok(runs.every((r) => r.workflowId === "wf-a"));
    });

    it("returns runs in descending startedAt order", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      await repo.createRun({ runId: "old", workflowId: "wf-x", startedAt: "2024-01-01T00:00:00.000Z" });
      await repo.createRun({ runId: "new", workflowId: "wf-x", startedAt: "2024-01-03T00:00:00.000Z" });
      await repo.createRun({ runId: "mid", workflowId: "wf-x", startedAt: "2024-01-02T00:00:00.000Z" });
      const runs = await repo.listRuns();
      assert.equal(runs[0].runId, "new");
      assert.equal(runs[1].runId, "mid");
      assert.equal(runs[2].runId, "old");
    });

    it("respects the limit parameter", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      for (let i = 0; i < 10; i++) {
        await repo.createRun({
          runId: `r${i}`,
          workflowId: "wf-lim",
          startedAt: `2024-01-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
        });
      }
      const runs = await repo.listRuns({ limit: 3 });
      assert.equal(runs.length, 3);
    });

    it("returns RunSummary shaped objects", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      await repo.createRun({ runId: "rs1", workflowId: "wf-sum", startedAt: "2024-06-01T10:00:00.000Z" });
      const runs = await repo.listRuns();
      const summary = runs[0];
      assert.ok(summary);
      assert.equal(summary.runId, "rs1");
      assert.equal(summary.workflowId, "wf-sum");
      assert.equal(summary.startedAt, "2024-06-01T10:00:00.000Z");
      assert.equal(summary.status, "running");
    });
  });

  describe("listRunsOlderThan", () => {
    it("returns empty array when no runs are present", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      const result = await repo.listRunsOlderThan({
        nowIso: new Date().toISOString(),
        defaultRetentionSeconds: 86400,
      });
      assert.deepEqual(result, []);
    });

    it("excludes runs that are still running or pending", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      await repo.createRun({ runId: "running-run", workflowId: "wf-r", startedAt: "2020-01-01T00:00:00.000Z" });
      const result = await repo.listRunsOlderThan({
        nowIso: "2025-01-01T00:00:00.000Z",
        defaultRetentionSeconds: 1,
      });
      assert.equal(result.length, 0, "running runs should not be listed as prune candidates");
    });

    it("excludes completed runs that are within the retention window", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      const now = "2024-06-01T12:00:00.000Z";
      // 1 hour ago — within 24h retention
      const recentStart = "2024-06-01T11:00:00.000Z";
      await repo.createRun({ runId: "recent", workflowId: "wf-ret", startedAt: recentStart });
      const run = await repo.load("recent");
      assert.ok(run);
      await repo.save({
        ...run,
        status: "completed",
        finishedAt: recentStart,
      });
      const result = await repo.listRunsOlderThan({ nowIso: now, defaultRetentionSeconds: 86400 });
      assert.equal(result.length, 0, "recent runs should not be pruned");
    });

    it("includes completed runs that have exceeded the retention window", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      const now = "2024-06-01T12:00:00.000Z";
      // Finished 2 days ago — beyond 24h retention
      const oldFinishedAt = "2024-05-30T12:00:00.000Z";
      await repo.createRun({ runId: "old-run", workflowId: "wf-old", startedAt: "2024-05-30T10:00:00.000Z" });
      const run = await repo.load("old-run");
      assert.ok(run);
      await repo.save({ ...run, status: "completed", finishedAt: oldFinishedAt });
      const result = await repo.listRunsOlderThan({ nowIso: now, defaultRetentionSeconds: 86400 });
      assert.equal(result.length, 1);
      assert.equal(result[0].runId, "old-run");
      assert.equal(result[0].finishedAt, oldFinishedAt);
    });

    it("includes failed runs that have exceeded the retention window", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      const now = "2024-06-01T12:00:00.000Z";
      const oldFinishedAt = "2024-05-30T12:00:00.000Z";
      await repo.createRun({ runId: "failed-run", workflowId: "wf-fail", startedAt: "2024-05-30T10:00:00.000Z" });
      const run = await repo.load("failed-run");
      assert.ok(run);
      await repo.save({ ...run, status: "failed", finishedAt: oldFinishedAt });
      const result = await repo.listRunsOlderThan({ nowIso: now, defaultRetentionSeconds: 86400 });
      assert.equal(result.length, 1);
      assert.equal(result[0].runId, "failed-run");
    });

    it("respects per-run policySnapshot.retentionSeconds over the default", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      const now = "2024-06-01T12:00:00.000Z";
      // Finished 2 hours ago
      const finishedAt = "2024-06-01T10:00:00.000Z";
      await repo.createRun({ runId: "policy-run", workflowId: "wf-pol", startedAt: "2024-06-01T09:00:00.000Z" });
      const run = await repo.load("policy-run");
      assert.ok(run);
      // Custom retention of 3 hours — run is only 2h old, not expired
      await repo.save({
        ...run,
        status: "completed",
        finishedAt,
        policySnapshot: { retentionSeconds: 10800 } as any,
      });
      const result = await repo.listRunsOlderThan({ nowIso: now, defaultRetentionSeconds: 3600 });
      assert.equal(result.length, 0, "run within its custom retention window should not be pruned");
    });

    it("respects the limit parameter", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      const now = "2024-06-01T12:00:00.000Z";
      for (let i = 0; i < 5; i++) {
        await repo.createRun({
          runId: `prune-${i}`,
          workflowId: "wf-prune",
          startedAt: `2024-05-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
        });
        const run = await repo.load(`prune-${i}`);
        assert.ok(run);
        await repo.save({
          ...run,
          status: "completed",
          finishedAt: `2024-05-${String(i + 1).padStart(2, "0")}T01:00:00.000Z`,
        });
      }
      const result = await repo.listRunsOlderThan({ nowIso: now, defaultRetentionSeconds: 1, limit: 2 });
      assert.equal(result.length, 2);
    });

    it("returns prune candidates sorted by finishedAt ascending", async () => {
      const repo = new InMemoryWorkflowExecutionRepository();
      const now = "2024-06-01T12:00:00.000Z";
      const dates = ["2024-05-03T00:00:00.000Z", "2024-05-01T00:00:00.000Z", "2024-05-02T00:00:00.000Z"];
      for (let i = 0; i < dates.length; i++) {
        await repo.createRun({ runId: `sort-${i}`, workflowId: "wf-sort", startedAt: dates[i] });
        const run = await repo.load(`sort-${i}`);
        assert.ok(run);
        await repo.save({ ...run, status: "completed", finishedAt: dates[i] });
      }
      const result = await repo.listRunsOlderThan({ nowIso: now, defaultRetentionSeconds: 1 });
      assert.equal(result.length, 3);
      assert.equal(result[0].finishedAt, "2024-05-01T00:00:00.000Z");
      assert.equal(result[1].finishedAt, "2024-05-02T00:00:00.000Z");
      assert.equal(result[2].finishedAt, "2024-05-03T00:00:00.000Z");
    });
  });
});
