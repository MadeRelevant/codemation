import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import { applyWorkflowEvent, reduceWorkflowEventIntoPersistedRunState } from "../../src/realtime/realtimeRunMutations";
import { runQueryKey } from "../../src/realtime/realtimeQueryKeys";
import type { NodeExecutionSnapshot, PersistedRunState, WorkflowEvent } from "../../src/realtime/realtimeDomainTypes";

/**
 * Visual regression guards for the "disco flicker" reported against heavily
 * branched workflows (e.g. `wf.dev.canvasLayoutStress`). The workflow's
 * converging `.if()` branches activate the same downstream node multiple
 * times within one run; without these guards the canvas snapshot rewinds
 * a node from `completed` back to `queued`/`running` on each re-activation.
 */
describe("realtimeRunMutations — monotonic snapshot merging", () => {
  const baseSnapshot = (overrides: Partial<NodeExecutionSnapshot>): NodeExecutionSnapshot => ({
    runId: "run-1",
    workflowId: "wf-1",
    nodeId: "node-A",
    status: "queued",
    updatedAt: new Date(1000).toISOString(),
    ...overrides,
  });

  const granularEvent = (snapshot: NodeExecutionSnapshot, kind: WorkflowEvent["kind"]): WorkflowEvent =>
    ({
      kind,
      runId: snapshot.runId,
      workflowId: snapshot.workflowId,
      at: snapshot.updatedAt,
      snapshot,
    }) as unknown as WorkflowEvent;

  it("does not regress status from completed back to queued/running on re-activation", () => {
    let state: PersistedRunState | undefined;
    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(baseSnapshot({ status: "queued" }), "nodeQueued"),
    );
    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(baseSnapshot({ status: "running" }), "nodeStarted"),
    );
    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(baseSnapshot({ status: "completed", outputs: { main: [{ json: { v: 1 } }] } }), "nodeCompleted"),
    );
    expect(state.nodeSnapshotsByNodeId["node-A"]?.status).toBe("completed");

    // Re-activation of the same nodeId — converging branch fires queued/running again.
    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(baseSnapshot({ status: "queued" }), "nodeQueued"),
    );
    expect(state.nodeSnapshotsByNodeId["node-A"]?.status).toBe("completed");

    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(baseSnapshot({ status: "running" }), "nodeStarted"),
    );
    expect(state.nodeSnapshotsByNodeId["node-A"]?.status).toBe("completed");
  });

  it("still allows nodeFailed to override completed (failure visibility wins)", () => {
    let state: PersistedRunState | undefined;
    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(baseSnapshot({ status: "completed" }), "nodeCompleted"),
    );
    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(baseSnapshot({ status: "failed", error: { message: "boom" } }), "nodeFailed"),
    );
    expect(state.nodeSnapshotsByNodeId["node-A"]?.status).toBe("failed");
  });

  it("preserves outputs across a re-activation that arrives without outputs populated", () => {
    let state: PersistedRunState | undefined;
    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(baseSnapshot({ status: "completed", outputs: { main: [{ json: { v: 7 } }] } }), "nodeCompleted"),
    );
    expect(state.nodeSnapshotsByNodeId["node-A"]?.outputs?.main?.length).toBe(1);

    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(baseSnapshot({ status: "queued", outputs: undefined }), "nodeQueued"),
    );
    // Edge labels read from snapshot.outputs — must stay populated to avoid blanking.
    expect(state.nodeSnapshotsByNodeId["node-A"]?.outputs?.main?.length).toBe(1);
  });

  it("does not erase a populated inputsByPort entry when a hollow re-activation arrives with empty arrays", () => {
    let state: PersistedRunState | undefined;
    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(baseSnapshot({ status: "completed", inputsByPort: { in: [{ json: { v: 1 } }] } }), "nodeCompleted"),
    );
    expect(state.nodeSnapshotsByNodeId["node-A"]?.inputsByPort?.in?.length).toBe(1);

    // The unused branch of a fan-out `.if()` fires through the same downstream
    // collect point and sends an empty payload — without the per-port merge
    // this would overwrite the populated entry and blank the edge label.
    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(baseSnapshot({ status: "queued", inputsByPort: { in: [] } }), "nodeQueued"),
    );
    expect(state.nodeSnapshotsByNodeId["node-A"]?.inputsByPort?.in?.length).toBe(1);
  });

  it("applyWorkflowEvent feeds the current cache state into the runSaved reducer (regression: runSaved must not bypass the monotonic merge)", () => {
    const queryClient = new QueryClient();
    const key = runQueryKey("run-1");

    // Seed cache via granular events: node-A reaches completed with populated outputs.
    applyWorkflowEvent(
      queryClient,
      granularEvent(baseSnapshot({ status: "completed", outputs: { main: [{ json: { v: 1 } }] } }), "nodeCompleted"),
    );
    expect(queryClient.getQueryData<PersistedRunState>(key)?.nodeSnapshotsByNodeId["node-A"]?.status).toBe("completed");

    // Server emits a runSaved that — for whatever reason — shows node-A as queued
    // with no outputs. Pre-fix this would clobber the cache. Post-fix the
    // monotonic guard clamps it forward.
    const regressedState: PersistedRunState = {
      runId: "run-1",
      workflowId: "wf-1",
      startedAt: new Date(1000).toISOString(),
      status: "pending",
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: { "node-A": baseSnapshot({ status: "queued" }) },
    };
    applyWorkflowEvent(queryClient, {
      kind: "runSaved",
      runId: "run-1",
      workflowId: "wf-1",
      at: new Date(2000).toISOString(),
      state: regressedState,
    } as unknown as WorkflowEvent);
    const after = queryClient.getQueryData<PersistedRunState>(key);
    expect(after?.nodeSnapshotsByNodeId["node-A"]?.status).toBe("completed");
    expect(after?.nodeSnapshotsByNodeId["node-A"]?.outputs?.main?.length).toBe(1);
  });

  it("preserves snapshot reference when a re-activation is canvas-equivalent (status + port lengths unchanged)", () => {
    let state: PersistedRunState | undefined;
    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(
        baseSnapshot({
          status: "completed",
          outputs: { main: [{ json: { v: 1 } }] },
          inputsByPort: { in: [{ json: { v: 0 } }] },
        }),
        "nodeCompleted",
      ),
    );
    const firstSnapshot = state.nodeSnapshotsByNodeId["node-A"];
    const firstMap = state.nodeSnapshotsByNodeId;

    // Re-activation from a hollow convergence branch — status would regress,
    // adds an empty port that didn't exist before. Canvas-equivalent to prev.
    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(
        baseSnapshot({
          status: "queued",
          inputsByPort: { "low-branch:main": [] },
        }),
        "nodeQueued",
      ),
    );
    // Snapshot reference preserved — canvas can short-circuit re-renders.
    expect(state.nodeSnapshotsByNodeId["node-A"]).toBe(firstSnapshot);
    // Outer map reference preserved too — useMemo deps stay stable.
    expect(state.nodeSnapshotsByNodeId).toBe(firstMap);
  });

  it("still picks up new ports that only appear in the second activation", () => {
    let state: PersistedRunState | undefined;
    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(baseSnapshot({ status: "completed", outputs: { main: [{ json: { v: 1 } }] } }), "nodeCompleted"),
    );
    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(
        baseSnapshot({
          status: "completed",
          outputs: { main: [{ json: { v: 2 } }], "fork-b": [{ json: { v: 3 } }] },
        }),
        "nodeCompleted",
      ),
    );
    // New port appears in second activation — preserved.
    expect(state.nodeSnapshotsByNodeId["node-A"]?.outputs?.["fork-b"]?.length).toBe(1);
    // Existing port follows the latest non-empty value.
    expect(state.nodeSnapshotsByNodeId["node-A"]?.outputs?.main?.length).toBe(1);
  });

  it("clamps runSaved-driven snapshots forward so a coarse server snapshot can't rewind state", () => {
    let state: PersistedRunState | undefined;
    state = reduceWorkflowEventIntoPersistedRunState(
      state,
      granularEvent(baseSnapshot({ status: "completed" }), "nodeCompleted"),
    );

    const regressed: PersistedRunState = {
      runId: "run-1",
      workflowId: "wf-1",
      startedAt: new Date(1000).toISOString(),
      status: "pending",
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {
        "node-A": baseSnapshot({ status: "queued" }),
      },
    };
    state = reduceWorkflowEventIntoPersistedRunState(state, {
      kind: "runSaved",
      runId: "run-1",
      workflowId: "wf-1",
      at: new Date(2000).toISOString(),
      state: regressed,
    } as unknown as WorkflowEvent);
    expect(state.nodeSnapshotsByNodeId["node-A"]?.status).toBe("completed");
  });
});
