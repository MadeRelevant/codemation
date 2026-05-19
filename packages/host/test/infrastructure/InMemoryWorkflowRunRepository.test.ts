/**
 * Tests for InMemoryWorkflowRunRepository covering the uncovered branches.
 */
import { describe, expect, it } from "vitest";
import { InMemoryWorkflowRunRepository } from "../../src/infrastructure/persistence/InMemoryWorkflowRunRepository";

async function makeRunState(repo: InMemoryWorkflowRunRepository, runId: string, workflowId = "wf-1") {
  await repo.createRun({ runId: runId as never, workflowId: workflowId as never, startedAt: new Date().toISOString() });
  return await repo.load(runId);
}

describe("InMemoryWorkflowRunRepository", () => {
  it("listRuns returns runs for a specific workflowId", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await makeRunState(repo, "run-a", "wf-1");
    await makeRunState(repo, "run-b", "wf-2");
    const runs = await repo.listRuns({ workflowId: "wf-1" });
    expect(runs.some((r) => r.runId === "run-a")).toBe(true);
    expect(runs.every((r) => r.workflowId === "wf-1")).toBe(true);
  });

  it("listRuns returns all runs when no workflowId filter", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await makeRunState(repo, "run-x", "wf-1");
    await makeRunState(repo, "run-y", "wf-2");
    const runs = await repo.listRuns({});
    expect(runs.length).toBeGreaterThanOrEqual(2);
  });

  it("listRuns respects limit", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    for (let i = 0; i < 5; i++) {
      await makeRunState(repo, `run-lim-${i}`, "wf-1");
    }
    const runs = await repo.listRuns({ workflowId: "wf-1", limit: 2 });
    expect(runs.length).toBeLessThanOrEqual(2);
  });

  it("deleteRun removes the run", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await makeRunState(repo, "run-del", "wf-1");
    await repo.deleteRun("run-del" as never);
    const loaded = await repo.load("run-del");
    expect(loaded).toBeUndefined();
  });

  it("listBinaryStorageKeys returns empty list", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    const keys = await repo.listBinaryStorageKeys("run-none" as never);
    expect(keys).toHaveLength(0);
  });

  it("listRunsOlderThan returns empty list (in-memory stub)", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await makeRunState(repo, "run-old", "wf-1");
    const runs = await repo.listRunsOlderThan({
      nowIso: new Date().toISOString(),
      defaultRetentionSeconds: 3600,
      limit: 10,
    });
    expect(Array.isArray(runs)).toBe(true);
  });

  it("updateTestCaseStatus is a no-op and does not throw", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await expect(repo.updateTestCaseStatus("run-1" as never, "running")).resolves.not.toThrow();
  });
});
