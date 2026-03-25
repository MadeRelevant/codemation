import { describe, expect, it } from "vitest";
import type {
  NodeExecutionSnapshot,
  PersistedRunState,
  WorkflowEvent,
} from "../src/features/workflows/lib/realtime/realtimeDomainTypes";
import { reduceWorkflowEventIntoPersistedRunState } from "../src/features/workflows/lib/realtime/realtimeRunMutations";

function nodeSnapshot(
  overrides: Partial<NodeExecutionSnapshot> & Pick<NodeExecutionSnapshot, "nodeId" | "status">,
): NodeExecutionSnapshot {
  return {
    runId: "run-1",
    workflowId: "wf-1",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("reduceWorkflowEventIntoPersistedRunState", () => {
  it("creates initial running state from runCreated", () => {
    const event: WorkflowEvent = {
      kind: "runCreated",
      runId: "run-new",
      workflowId: "wf-1",
      at: "2026-01-02T00:00:00.000Z",
    };
    const next = reduceWorkflowEventIntoPersistedRunState(undefined, event);
    expect(next.runId).toBe("run-new");
    expect(next.workflowId).toBe("wf-1");
    expect(next.startedAt).toBe("2026-01-02T00:00:00.000Z");
    expect(next.status).toBe("running");
  });

  it("replaces with persisted state from runSaved", () => {
    const saved: PersistedRunState = {
      runId: "run-1",
      workflowId: "wf-1",
      startedAt: "2026-01-01T00:00:00.000Z",
      status: "completed",
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
    };
    const event: WorkflowEvent = {
      kind: "runSaved",
      runId: "run-1",
      workflowId: "wf-1",
      at: "2026-01-01T00:00:01.000Z",
      state: saved,
    };
    expect(reduceWorkflowEventIntoPersistedRunState(undefined, event)).toEqual(saved);
  });

  it("marks run completed when the last node completes with no pending work", () => {
    const created: WorkflowEvent = {
      kind: "runCreated",
      runId: "run-1",
      workflowId: "wf-1",
      at: "2026-01-01T00:00:00.000Z",
    };
    const afterCreate = reduceWorkflowEventIntoPersistedRunState(undefined, created);
    const completedEvent: WorkflowEvent = {
      kind: "nodeCompleted",
      runId: "run-1",
      workflowId: "wf-1",
      at: "2026-01-01T00:00:02.000Z",
      snapshot: nodeSnapshot({
        nodeId: "n1",
        status: "completed",
        finishedAt: "2026-01-01T00:00:02.000Z",
      }),
    };
    const next = reduceWorkflowEventIntoPersistedRunState(afterCreate, completedEvent);
    expect(next.status).toBe("completed");
  });
});
