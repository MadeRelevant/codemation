import { describe, expect, it } from "vitest";

import { InMemoryWorkflowRunRepository } from "../../src/infrastructure/persistence/InMemoryWorkflowRunRepository";

describe("InMemoryWorkflowRunRepository", () => {
  it("round-trips childRunId through save/loadRunDetail for a node snapshot", async () => {
    const repo = new InMemoryWorkflowRunRepository();

    await repo.createRun({
      runId: "run-imem-1",
      workflowId: "wf-parent",
      startedAt: "2026-05-07T10:00:00.000Z",
    });

    await repo.save({
      runId: "run-imem-1",
      workflowId: "wf-parent",
      startedAt: "2026-05-07T10:00:00.000Z",
      revision: 0,
      status: "completed",
      finishedAt: "2026-05-07T10:00:05.000Z",
      pending: undefined,
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {
        "sub-node": {
          runId: "run-imem-1",
          workflowId: "wf-parent",
          nodeId: "sub-node",
          activationId: "act-1",
          status: "completed",
          queuedAt: "2026-05-07T10:00:01.000Z",
          startedAt: "2026-05-07T10:00:02.000Z",
          finishedAt: "2026-05-07T10:00:03.000Z",
          updatedAt: "2026-05-07T10:00:03.000Z",
          childRunId: "child-run-imem-abc",
        },
      },
      connectionInvocations: [],
    });

    const detail = await repo.loadRunDetail("run-imem-1");
    expect(detail).toBeDefined();

    const instance = detail!.executionInstances.find((i) => i.slotNodeId === "sub-node");
    expect(instance).toBeDefined();
    expect(instance!.childRunId).toBe("child-run-imem-abc");
  });

  it("omits childRunId from executionInstances when the snapshot does not carry it (backward compat)", async () => {
    const repo = new InMemoryWorkflowRunRepository();

    await repo.createRun({
      runId: "run-imem-2",
      workflowId: "wf-parent",
      startedAt: "2026-05-07T10:00:00.000Z",
    });

    await repo.save({
      runId: "run-imem-2",
      workflowId: "wf-parent",
      startedAt: "2026-05-07T10:00:00.000Z",
      revision: 0,
      status: "completed",
      finishedAt: "2026-05-07T10:00:05.000Z",
      pending: undefined,
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {
        "node-a": {
          runId: "run-imem-2",
          workflowId: "wf-parent",
          nodeId: "node-a",
          activationId: "act-1",
          status: "completed",
          queuedAt: undefined,
          startedAt: undefined,
          finishedAt: undefined,
          updatedAt: "2026-05-07T10:00:01.000Z",
          // childRunId intentionally absent.
        },
      },
      connectionInvocations: [],
    });

    const detail = await repo.loadRunDetail("run-imem-2");
    const instance = detail!.executionInstances.find((i) => i.slotNodeId === "node-a");
    expect(instance).toBeDefined();
    expect(instance).not.toHaveProperty("childRunId");
  });

  it("load returns undefined for unknown runId", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    const result = await repo.load("nonexistent");
    expect(result).toBeUndefined();
  });

  it("loadRunDetail returns undefined for unknown runId", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    const result = await repo.loadRunDetail("nonexistent");
    expect(result).toBeUndefined();
  });

  it("loadSchedulingState returns undefined for unknown runId", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    const result = await repo.loadSchedulingState("nonexistent");
    expect(result).toBeUndefined();
  });

  it("loadSchedulingState returns pending and queue for known run", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun({ runId: "run-sch", workflowId: "wf", startedAt: "2026-01-01T00:00:00.000Z" });
    const state = await repo.load("run-sch");
    await repo.save({ ...state!, pending: { nodeId: "n1", activationId: "a1" } as never, queue: [] });
    const sch = await repo.loadSchedulingState("run-sch");
    expect(sch!.pending).toMatchObject({ nodeId: "n1" });
  });

  it("listRuns returns runs sorted newest-first", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun({ runId: "run-old", workflowId: "wf1", startedAt: "2026-01-01T00:00:00.000Z" });
    await repo.createRun({ runId: "run-new", workflowId: "wf1", startedAt: "2026-06-01T00:00:00.000Z" });
    const runs = await repo.listRuns({ workflowId: "wf1" });
    expect(runs[0].runId).toBe("run-new");
    expect(runs[1].runId).toBe("run-old");
  });

  it("listRuns filters by workflowId", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun({ runId: "run-wf1", workflowId: "wf1", startedAt: "2026-01-01T00:00:00.000Z" });
    await repo.createRun({ runId: "run-wf2", workflowId: "wf2", startedAt: "2026-01-01T00:00:00.000Z" });
    const runs = await repo.listRuns({ workflowId: "wf1" });
    expect(runs).toHaveLength(1);
    expect(runs[0].runId).toBe("run-wf1");
  });

  it("listRuns respects limit", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun({ runId: "r1", workflowId: "wf", startedAt: "2026-01-01T00:00:00.000Z" });
    await repo.createRun({ runId: "r2", workflowId: "wf", startedAt: "2026-02-01T00:00:00.000Z" });
    await repo.createRun({ runId: "r3", workflowId: "wf", startedAt: "2026-03-01T00:00:00.000Z" });
    const runs = await repo.listRuns({ limit: 2 });
    expect(runs).toHaveLength(2);
  });

  it("deleteRun removes the run", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun({ runId: "run-del", workflowId: "wf", startedAt: "2026-01-01T00:00:00.000Z" });
    await repo.deleteRun("run-del");
    const result = await repo.load("run-del");
    expect(result).toBeUndefined();
  });

  it("listBinaryStorageKeys returns empty array when run not found", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    const keys = await repo.listBinaryStorageKeys("nonexistent");
    expect(keys).toEqual([]);
  });

  it("listBinaryStorageKeys collects keys from outputsByNode", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun({ runId: "run-bin", workflowId: "wf", startedAt: "2026-01-01T00:00:00.000Z" });
    const state = await repo.load("run-bin");
    await repo.save({
      ...state!,
      outputsByNode: {
        node1: {
          main: [
            {
              json: {},
              binary: {
                f: { id: "b1", storageKey: "key-abc", mimeType: "image/png", size: 10, previewKind: "image" } as never,
              },
            },
          ],
        },
      },
    });
    const keys = await repo.listBinaryStorageKeys("run-bin");
    expect(keys).toContain("key-abc");
  });

  it("listRunsOlderThan returns completed runs past retention", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun({ runId: "run-old", workflowId: "wf", startedAt: "2025-01-01T00:00:00.000Z" });
    const state = await repo.load("run-old");
    await repo.save({ ...state!, status: "completed", finishedAt: "2025-01-01T00:01:00.000Z" });
    const candidates = await repo.listRunsOlderThan({
      nowIso: "2026-01-01T00:00:00.000Z",
      defaultRetentionSeconds: 60,
    });
    expect(candidates.some((c) => c.runId === "run-old")).toBe(true);
  });

  it("listRunsOlderThan does not include running runs", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun({ runId: "run-running", workflowId: "wf", startedAt: "2025-01-01T00:00:00.000Z" });
    const candidates = await repo.listRunsOlderThan({
      nowIso: "2026-01-01T00:00:00.000Z",
      defaultRetentionSeconds: 60,
    });
    expect(candidates.every((c) => c.runId !== "run-running")).toBe(true);
  });

  it("updateTestCaseStatus is a no-op", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await expect(repo.updateTestCaseStatus("run_1", "succeeded")).resolves.toBeUndefined();
  });

  it("loadRunDetail includes connectionInvocations as executionInstances", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun({ runId: "run-inv", workflowId: "wf-1", startedAt: "2026-01-01T00:00:00.000Z" });
    const state = await repo.load("run-inv");
    await repo.save({
      ...state!,
      connectionInvocations: [
        {
          invocationId: "inv-1",
          connectionNodeId: "conn-node",
          parentAgentNodeId: "agent-node",
          parentAgentActivationId: "act-1",
          iterationId: "iter-1",
          itemIndex: 0,
          status: "completed",
          queuedAt: "2026-01-01T00:00:01.000Z",
          startedAt: "2026-01-01T00:00:02.000Z",
          finishedAt: "2026-01-01T00:00:03.000Z",
          managedInput: { model: "gpt-4" } as never,
          managedOutput: { text: "hello" } as never,
        } as never,
      ],
    });
    const detail = await repo.loadRunDetail("run-inv");
    expect(detail).toBeDefined();
    const invInst = detail!.executionInstances.find((i) => i.kind === "connectionInvocation");
    expect(invInst).toBeDefined();
    expect(invInst!.slotNodeId).toBe("conn-node");
    expect(invInst!.iterationId).toBe("iter-1");
  });

  it("loadSchedulingState returns pending and queue from run state", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun({ runId: "run-sched", workflowId: "wf-1", startedAt: "2026-01-01T00:00:00.000Z" });
    const state = await repo.load("run-sched");
    await repo.save({
      ...state!,
      pending: { batchId: "batch-1", activationsByNodeId: {} } as never,
      queue: [{ nodeId: "n1", activationId: "a1" } as never],
    });
    const sched = await repo.loadSchedulingState("run-sched");
    expect(sched).toBeDefined();
    expect(sched!.pending?.batchId).toBe("batch-1");
    expect(sched!.queue).toHaveLength(1);
  });

  it("loadSchedulingState returns undefined for unknown runId", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    const sched = await repo.loadSchedulingState("nonexistent");
    expect(sched).toBeUndefined();
  });

  it("listBinaryStorageKeys collects keys from mutableState pinnedOutputsByPort", async () => {
    const repo = new InMemoryWorkflowRunRepository();
    await repo.createRun({ runId: "run-mutable", workflowId: "wf-1", startedAt: "2026-01-01T00:00:00.000Z" });
    const state = await repo.load("run-mutable");
    await repo.save({
      ...state!,
      mutableState: {
        nodesById: {
          "node-1": {
            pinnedOutputsByPort: {
              main: [
                {
                  json: {},
                  binary: {
                    f: {
                      id: "b1",
                      storageKey: "pinned-key-1",
                      mimeType: "image/png",
                      size: 10,
                      previewKind: "image",
                    } as never,
                  },
                },
              ],
            },
            lastDebugInput: [
              {
                json: {},
                binary: {
                  g: {
                    id: "b2",
                    storageKey: "debug-key-1",
                    mimeType: "image/png",
                    size: 5,
                    previewKind: "image",
                  } as never,
                },
              },
            ],
          } as never,
        },
      } as never,
    });
    const keys = await repo.listBinaryStorageKeys("run-mutable");
    expect(keys).toContain("pinned-key-1");
    expect(keys).toContain("debug-key-1");
  });
});
