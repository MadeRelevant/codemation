import { describe, expect, it } from "vitest";

import { CurrentStatusLabelSelector } from "../../src/realtime/CurrentStatusLabelSelector";
import type { ConnectionInvocationRecord } from "../../src/realtime/realtimeDomainTypes";

function makeRecord(overrides: Partial<ConnectionInvocationRecord>): ConnectionInvocationRecord {
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

describe("CurrentStatusLabelSelector", () => {
  it("returns undefined when there are no invocations", () => {
    expect(CurrentStatusLabelSelector.select("conn-A", undefined)).toBeUndefined();
    expect(CurrentStatusLabelSelector.select("conn-A", [])).toBeUndefined();
  });

  it("returns undefined when all invocations have empty or absent labels", () => {
    const invocations: ReadonlyArray<ConnectionInvocationRecord> = [
      makeRecord({ invocationId: "inv_1", updatedAt: "2026-01-01T00:00:01.000Z" }),
      makeRecord({ invocationId: "inv_2", updatedAt: "2026-01-01T00:00:02.000Z", statusLabel: "" }),
    ];
    expect(CurrentStatusLabelSelector.select("conn-A", invocations)).toBeUndefined();
  });

  it("returns the latest non-empty label across multiple invocations on the same node", () => {
    const invocations: ReadonlyArray<ConnectionInvocationRecord> = [
      makeRecord({
        invocationId: "inv_1",
        updatedAt: "2026-01-01T00:00:01.000Z",
        statusLabel: "calling search_messages",
      }),
      makeRecord({
        invocationId: "inv_2",
        updatedAt: "2026-01-01T00:00:03.000Z",
        statusLabel: "calling send_email",
      }),
      makeRecord({
        invocationId: "inv_3",
        updatedAt: "2026-01-01T00:00:02.000Z",
        statusLabel: "calling list_drafts",
      }),
    ];
    expect(CurrentStatusLabelSelector.select("conn-A", invocations)).toBe("calling send_email");
  });

  it("ignores invocations on other connectionNodeIds", () => {
    const invocations: ReadonlyArray<ConnectionInvocationRecord> = [
      makeRecord({
        invocationId: "inv_1",
        connectionNodeId: "conn-OTHER",
        updatedAt: "2026-01-01T00:00:05.000Z",
        statusLabel: "elsewhere label",
      }),
      makeRecord({
        invocationId: "inv_2",
        connectionNodeId: "conn-A",
        updatedAt: "2026-01-01T00:00:02.000Z",
        statusLabel: "mine label",
      }),
    ];
    expect(CurrentStatusLabelSelector.select("conn-A", invocations)).toBe("mine label");
  });

  it("skips empty-string labels in favor of an earlier populated one", () => {
    const invocations: ReadonlyArray<ConnectionInvocationRecord> = [
      makeRecord({
        invocationId: "inv_1",
        updatedAt: "2026-01-01T00:00:01.000Z",
        statusLabel: "calling search_messages",
      }),
      makeRecord({
        invocationId: "inv_2",
        updatedAt: "2026-01-01T00:00:02.000Z",
        statusLabel: "",
      }),
    ];
    expect(CurrentStatusLabelSelector.select("conn-A", invocations)).toBe("calling search_messages");
  });
});
