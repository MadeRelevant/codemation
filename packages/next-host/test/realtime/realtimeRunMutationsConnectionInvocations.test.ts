import { describe, expect, it } from "vitest";
import type {
  ConnectionInvocationRecord,
  PersistedRunState,
  WorkflowEvent,
} from "../../src/features/workflows/lib/realtime/realtimeDomainTypes";
import { reduceWorkflowEventIntoPersistedRunState } from "../../src/features/workflows/lib/realtime/realtimeRunMutations";

const RUN_ID = "run-conn-inv";
const WORKFLOW_ID = "wf-conn-inv";

function makeInvocation(args: {
  invocationId: string;
  status: ConnectionInvocationRecord["status"];
  startedAt?: string;
  finishedAt?: string;
  updatedAt: string;
  iterationId?: string;
  itemIndex?: number;
}): ConnectionInvocationRecord {
  return {
    invocationId: args.invocationId,
    runId: RUN_ID,
    workflowId: WORKFLOW_ID,
    connectionNodeId: "agent$1__conn__llm",
    parentAgentNodeId: "agent",
    parentAgentActivationId: "act_1",
    status: args.status,
    startedAt: args.startedAt,
    finishedAt: args.finishedAt,
    updatedAt: args.updatedAt,
    iterationId: args.iterationId,
    itemIndex: args.itemIndex,
  };
}

function blankRunState(): PersistedRunState {
  return {
    runId: RUN_ID,
    workflowId: WORKFLOW_ID,
    startedAt: "2026-04-30T10:00:00.000Z",
    status: "running",
    queue: [],
    outputsByNode: {},
    nodeSnapshotsByNodeId: {},
    connectionInvocations: [],
  };
}

describe("reduceWorkflowEventIntoPersistedRunState (connection invocations)", () => {
  it("appends a new invocation row on connectionInvocationStarted", () => {
    const startedRecord = makeInvocation({
      invocationId: "inv_1",
      status: "running",
      startedAt: "2026-04-30T10:00:00.000Z",
      updatedAt: "2026-04-30T10:00:00.000Z",
      iterationId: "iter_1",
      itemIndex: 0,
    });
    const event: WorkflowEvent = {
      kind: "connectionInvocationStarted",
      runId: RUN_ID,
      workflowId: WORKFLOW_ID,
      at: "2026-04-30T10:00:00.000Z",
      record: startedRecord,
    };

    const next = reduceWorkflowEventIntoPersistedRunState(blankRunState(), event);
    expect(next.connectionInvocations).toHaveLength(1);
    expect(next.connectionInvocations?.[0]?.invocationId).toBe("inv_1");
    expect(next.connectionInvocations?.[0]?.status).toBe("running");
  });

  it("replaces the running row when a completed event arrives for the same invocationId", () => {
    const runningRecord = makeInvocation({
      invocationId: "inv_1",
      status: "running",
      startedAt: "2026-04-30T10:00:00.000Z",
      updatedAt: "2026-04-30T10:00:00.000Z",
    });
    const startedEvent: WorkflowEvent = {
      kind: "connectionInvocationStarted",
      runId: RUN_ID,
      workflowId: WORKFLOW_ID,
      at: "2026-04-30T10:00:00.000Z",
      record: runningRecord,
    };
    const afterRunning = reduceWorkflowEventIntoPersistedRunState(blankRunState(), startedEvent);

    const completedRecord = makeInvocation({
      invocationId: "inv_1",
      status: "completed",
      startedAt: "2026-04-30T10:00:00.000Z",
      finishedAt: "2026-04-30T10:00:02.000Z",
      updatedAt: "2026-04-30T10:00:02.000Z",
    });
    const completedEvent: WorkflowEvent = {
      kind: "connectionInvocationCompleted",
      runId: RUN_ID,
      workflowId: WORKFLOW_ID,
      at: "2026-04-30T10:00:02.000Z",
      record: completedRecord,
    };
    const afterCompleted = reduceWorkflowEventIntoPersistedRunState(afterRunning, completedEvent);

    expect(afterCompleted.connectionInvocations).toHaveLength(1);
    expect(afterCompleted.connectionInvocations?.[0]?.invocationId).toBe("inv_1");
    expect(afterCompleted.connectionInvocations?.[0]?.status).toBe("completed");
    expect(afterCompleted.connectionInvocations?.[0]?.finishedAt).toBe("2026-04-30T10:00:02.000Z");
  });

  it("replaces the running row with a failed status when failed event arrives", () => {
    const runningRecord = makeInvocation({
      invocationId: "inv_1",
      status: "running",
      startedAt: "2026-04-30T10:00:00.000Z",
      updatedAt: "2026-04-30T10:00:00.000Z",
    });
    const after = reduceWorkflowEventIntoPersistedRunState(blankRunState(), {
      kind: "connectionInvocationStarted",
      runId: RUN_ID,
      workflowId: WORKFLOW_ID,
      at: "2026-04-30T10:00:00.000Z",
      record: runningRecord,
    });

    const failedRecord = makeInvocation({
      invocationId: "inv_1",
      status: "failed",
      startedAt: "2026-04-30T10:00:00.000Z",
      finishedAt: "2026-04-30T10:00:01.000Z",
      updatedAt: "2026-04-30T10:00:01.000Z",
    });
    const next = reduceWorkflowEventIntoPersistedRunState(after, {
      kind: "connectionInvocationFailed",
      runId: RUN_ID,
      workflowId: WORKFLOW_ID,
      at: "2026-04-30T10:00:01.000Z",
      record: failedRecord,
    });

    expect(next.connectionInvocations).toHaveLength(1);
    expect(next.connectionInvocations?.[0]?.status).toBe("failed");
  });

  it("preserves invocations from other invocationIds when an event for one arrives", () => {
    const baseState: PersistedRunState = {
      ...blankRunState(),
      connectionInvocations: [
        makeInvocation({
          invocationId: "inv_other",
          status: "running",
          startedAt: "2026-04-30T10:00:00.000Z",
          updatedAt: "2026-04-30T10:00:00.000Z",
        }),
      ],
    };
    const newRecord = makeInvocation({
      invocationId: "inv_1",
      status: "running",
      startedAt: "2026-04-30T10:00:01.000Z",
      updatedAt: "2026-04-30T10:00:01.000Z",
    });
    const next = reduceWorkflowEventIntoPersistedRunState(baseState, {
      kind: "connectionInvocationStarted",
      runId: RUN_ID,
      workflowId: WORKFLOW_ID,
      at: "2026-04-30T10:00:01.000Z",
      record: newRecord,
    });
    expect(next.connectionInvocations).toHaveLength(2);
    expect(next.connectionInvocations?.map((inv) => inv.invocationId).sort()).toEqual(["inv_1", "inv_other"]);
  });
});
