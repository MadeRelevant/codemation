import "reflect-metadata";

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

  it("returns undefined for pending status", () => {
    const iso = RunFinishedAtFactory.resolveIso({
      status: "pending",
      nodeSnapshotsByNodeId: {},
    });
    assert.equal(iso, undefined);
  });

  it("returns undefined for running status", () => {
    const iso = RunFinishedAtFactory.resolveIso({
      status: "running" as never,
      nodeSnapshotsByNodeId: {},
    });
    assert.equal(iso, undefined);
  });

  it("falls back to latest snapshot finishedAt when no root finishedAt", () => {
    const iso = RunFinishedAtFactory.resolveIso({
      status: "completed",
      finishedAt: undefined,
      nodeSnapshotsByNodeId: {
        n1: {
          runId: "r",
          workflowId: "w",
          nodeId: "n1",
          status: "completed",
          updatedAt: "2026-01-01T00:00:00.000Z",
          finishedAt: "2026-01-01T10:00:00.000Z",
        },
        n2: {
          runId: "r",
          workflowId: "w",
          nodeId: "n2",
          status: "completed",
          updatedAt: "2026-01-01T00:00:00.000Z",
          finishedAt: "2026-01-01T12:00:00.000Z",
        },
      },
    });
    assert.equal(iso, "2026-01-01T12:00:00.000Z");
  });

  it("returns undefined when no root finishedAt and no snapshot finishedAts", () => {
    const iso = RunFinishedAtFactory.resolveIso({
      status: "failed",
      finishedAt: undefined,
      nodeSnapshotsByNodeId: {
        n1: {
          runId: "r",
          workflowId: "w",
          nodeId: "n1",
          status: "running",
          updatedAt: "2026-01-01T00:00:00.000Z",
          finishedAt: undefined,
        },
      },
    });
    assert.equal(iso, undefined);
  });
});
