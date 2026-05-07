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
});
