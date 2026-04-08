import assert from "node:assert/strict";
import { describe, it } from "vitest";

import { RunFinishedAtFactory } from "../../src/contracts/runFinishedAtFactory";

describe("RunFinishedAtFactory", () => {
  it("prefers persisted run root finishedAt when present", () => {
    const iso = RunFinishedAtFactory.resolveIso({
      status: "completed",
      finishedAt: "2026-01-02T00:00:00.000Z",
      nodeSnapshotsByNodeId: {
        n1: {
          runId: "r",
          workflowId: "w",
          nodeId: "n1",
          status: "completed",
          updatedAt: "2026-01-01T00:00:00.000Z",
          finishedAt: "2026-01-01T12:00:00.000Z",
        },
      },
    });
    assert.equal(iso, "2026-01-02T00:00:00.000Z");
  });
});
