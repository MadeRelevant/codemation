import { describe, expect, it } from "vitest";

import { reduceWorkflowEventIntoPersistedRunState } from "../../src/realtime/realtimeRunMutations";
import type {
  ConnectionInvocationRecord,
  PersistedRunState,
  WorkflowEvent,
} from "../../src/realtime/realtimeDomainTypes";

function makeInvocation(overrides: Partial<ConnectionInvocationRecord>): ConnectionInvocationRecord {
  return {
    invocationId: overrides.invocationId ?? "inv_1",
    runId: "run-1",
    workflowId: "wf-1",
    connectionNodeId: overrides.connectionNodeId ?? "conn-A",
    parentAgentNodeId: "agent-1",
    parentAgentActivationId: "act-1",
    status: overrides.status ?? "running",
    updatedAt: overrides.updatedAt ?? "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("realtimeRunMutations — statusLabel projection", () => {
  it("preserves statusLabel on the reduced run state", () => {
    const record = makeInvocation({
      invocationId: "inv_1",
      statusLabel: "calling search_messages",
    });
    const event: WorkflowEvent = {
      kind: "connectionInvocationStarted",
      runId: "run-1",
      workflowId: "wf-1",
      at: record.updatedAt,
      record,
    };
    const state: PersistedRunState = reduceWorkflowEventIntoPersistedRunState(undefined, event);
    const invocations = state.connectionInvocations ?? [];
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.statusLabel).toBe("calling search_messages");
  });

  it("replaces an existing invocation with the latest record (statusLabel updates)", () => {
    const initial: WorkflowEvent = {
      kind: "connectionInvocationStarted",
      runId: "run-1",
      workflowId: "wf-1",
      at: "2026-01-01T00:00:01.000Z",
      record: makeInvocation({
        invocationId: "inv_1",
        statusLabel: "calling search_messages",
        updatedAt: "2026-01-01T00:00:01.000Z",
      }),
    };
    const completed: WorkflowEvent = {
      kind: "connectionInvocationCompleted",
      runId: "run-1",
      workflowId: "wf-1",
      at: "2026-01-01T00:00:02.000Z",
      record: makeInvocation({
        invocationId: "inv_1",
        status: "completed",
        statusLabel: "completed search_messages",
        updatedAt: "2026-01-01T00:00:02.000Z",
      }),
    };
    let state: PersistedRunState | undefined;
    state = reduceWorkflowEventIntoPersistedRunState(state, initial);
    state = reduceWorkflowEventIntoPersistedRunState(state, completed);
    const invocations = state.connectionInvocations ?? [];
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.statusLabel).toBe("completed search_messages");
    expect(invocations[0]?.status).toBe("completed");
  });
});
