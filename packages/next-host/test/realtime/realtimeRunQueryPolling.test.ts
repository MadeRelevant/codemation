import { describe, expect, it } from "vitest";
import type { PersistedRunState } from "../../src/features/workflows/lib/realtime/realtimeDomainTypes";
import {
  resolveFetchedRunState,
  resolveRunPollingIntervalMs,
  resolveTelemetryTraceRefetchIntervalMs,
} from "../../src/features/workflows/hooks/realtime/runQueryPolling";

function createRunState(status: PersistedRunState["status"]): PersistedRunState {
  return {
    runId: "run-1",
    workflowId: "wf-1",
    startedAt: "2026-01-01T00:00:00.000Z",
    status,
    queue: [],
    outputsByNode: {},
    nodeSnapshotsByNodeId: {},
  };
}

describe("resolveRunPollingIntervalMs", () => {
  it("polls while the run is non-terminal", () => {
    expect(resolveRunPollingIntervalMs({ runState: createRunState("pending"), pollWhileNonTerminalMs: 250 })).toBe(250);
    expect(resolveRunPollingIntervalMs({ runState: createRunState("running"), pollWhileNonTerminalMs: 250 })).toBe(250);
  });

  it("stops polling once the run is terminal or polling is disabled", () => {
    expect(resolveRunPollingIntervalMs({ runState: createRunState("completed"), pollWhileNonTerminalMs: 250 })).toBe(
      false,
    );
    expect(resolveRunPollingIntervalMs({ runState: createRunState("failed"), pollWhileNonTerminalMs: 250 })).toBe(
      false,
    );
    expect(
      resolveRunPollingIntervalMs({ runState: createRunState("pending"), pollWhileNonTerminalMs: undefined }),
    ).toBe(false);
    expect(resolveRunPollingIntervalMs({ runState: undefined, pollWhileNonTerminalMs: 250 })).toBe(false);
  });
});

describe("resolveTelemetryTraceRefetchIntervalMs", () => {
  it("polls when run status is non-terminal and pollWhileNonTerminalMs is set", () => {
    expect(resolveTelemetryTraceRefetchIntervalMs({ runStatus: "pending", pollWhileNonTerminalMs: 500 })).toBe(500);
    expect(resolveTelemetryTraceRefetchIntervalMs({ runStatus: "running", pollWhileNonTerminalMs: 500 })).toBe(500);
  });

  it("polls when runStatus is undefined (run query not yet hydrated) and pollWhileNonTerminalMs is set", () => {
    expect(resolveTelemetryTraceRefetchIntervalMs({ runStatus: undefined, pollWhileNonTerminalMs: 500 })).toBe(500);
  });

  it("stops polling when run status is terminal", () => {
    expect(resolveTelemetryTraceRefetchIntervalMs({ runStatus: "completed", pollWhileNonTerminalMs: 500 })).toBe(false);
    expect(resolveTelemetryTraceRefetchIntervalMs({ runStatus: "failed", pollWhileNonTerminalMs: 500 })).toBe(false);
  });

  it("returns false when pollWhileNonTerminalMs is undefined even if status is non-terminal", () => {
    expect(resolveTelemetryTraceRefetchIntervalMs({ runStatus: "pending", pollWhileNonTerminalMs: undefined })).toBe(
      false,
    );
    expect(resolveTelemetryTraceRefetchIntervalMs({ runStatus: "running", pollWhileNonTerminalMs: undefined })).toBe(
      false,
    );
    expect(resolveTelemetryTraceRefetchIntervalMs({ runStatus: undefined, pollWhileNonTerminalMs: undefined })).toBe(
      false,
    );
  });
});

describe("resolveFetchedRunState", () => {
  it("keeps a regressed pending fetch from overwriting a newer cached state", () => {
    expect(
      resolveFetchedRunState({ incoming: createRunState("pending"), previous: createRunState("completed") }).status,
    ).toBe("completed");
    expect(
      resolveFetchedRunState({ incoming: createRunState("pending"), previous: createRunState("failed") }).status,
    ).toBe("failed");
    expect(
      resolveFetchedRunState({ incoming: createRunState("pending"), previous: createRunState("running") }).status,
    ).toBe("running");
  });

  it("uses the incoming state when it advances or when there is no cache", () => {
    expect(
      resolveFetchedRunState({ incoming: createRunState("completed"), previous: createRunState("pending") }).status,
    ).toBe("completed");
    expect(resolveFetchedRunState({ incoming: createRunState("pending"), previous: undefined }).status).toBe("pending");
  });
});
