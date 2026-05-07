import { describe, expect, it } from "vitest";
import { NodeExecutionSnapshotFactory } from "../../src/execution/NodeExecutionSnapshotFactory";
import type { NodeExecutionSnapshot } from "../../src/types";

const base = {
  runId: "run_1" as NodeExecutionSnapshot["runId"],
  workflowId: "wf.test" as NodeExecutionSnapshot["workflowId"],
  nodeId: "node_1" as NodeExecutionSnapshot["nodeId"],
  activationId: "act_1" as NonNullable<NodeExecutionSnapshot["activationId"]>,
  finishedAt: "2026-01-01T00:00:00.000Z",
  inputsByPort: {},
  outputs: {},
};

describe("NodeExecutionSnapshotFactory — childRunId propagation", () => {
  describe("completed", () => {
    it("preserves childRunId from previous snapshot", () => {
      const previous: NodeExecutionSnapshot = {
        ...base,
        status: "running",
        updatedAt: base.finishedAt,
        childRunId: "run_child_1" as NodeExecutionSnapshot["childRunId"],
      };
      const snap = NodeExecutionSnapshotFactory.completed({ ...base, previous });
      expect(snap.childRunId).toBe("run_child_1");
    });

    it("omits childRunId when previous has none", () => {
      const previous: NodeExecutionSnapshot = {
        ...base,
        status: "running",
        updatedAt: base.finishedAt,
      };
      const snap = NodeExecutionSnapshotFactory.completed({ ...base, previous });
      expect(Object.prototype.hasOwnProperty.call(snap, "childRunId")).toBe(false);
    });

    it("omits childRunId when no previous", () => {
      const snap = NodeExecutionSnapshotFactory.completed({ ...base });
      expect(Object.prototype.hasOwnProperty.call(snap, "childRunId")).toBe(false);
    });
  });

  describe("failed", () => {
    const failArgs = { ...base, outputs: undefined, error: new Error("boom") };

    it("preserves childRunId from previous snapshot", () => {
      const previous: NodeExecutionSnapshot = {
        ...base,
        status: "running",
        updatedAt: base.finishedAt,
        childRunId: "run_child_2" as NodeExecutionSnapshot["childRunId"],
      };
      const snap = NodeExecutionSnapshotFactory.failed({ ...failArgs, previous });
      expect(snap.childRunId).toBe("run_child_2");
    });

    it("omits childRunId when previous has none", () => {
      const previous: NodeExecutionSnapshot = {
        ...base,
        status: "running",
        updatedAt: base.finishedAt,
      };
      const snap = NodeExecutionSnapshotFactory.failed({ ...failArgs, previous });
      expect(Object.prototype.hasOwnProperty.call(snap, "childRunId")).toBe(false);
    });
  });

  describe("skipped", () => {
    it("preserves childRunId from previous snapshot", () => {
      const previous: NodeExecutionSnapshot = {
        ...base,
        status: "running",
        updatedAt: base.finishedAt,
        childRunId: "run_child_3" as NodeExecutionSnapshot["childRunId"],
      };
      const snap = NodeExecutionSnapshotFactory.skipped({ ...base, previous });
      expect(snap.childRunId).toBe("run_child_3");
    });
  });
});
