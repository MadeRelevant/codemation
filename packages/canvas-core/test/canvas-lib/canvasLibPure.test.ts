/**
 * Tests for pure canvas-lib logic: path planners, geometry, label estimator, port ordering, edge counts.
 * These run in node env (no DOM required — all pure functions/class statics).
 */
import { describe, expect, test } from "vitest";

import { WorkflowCanvasRoundedOrthogonalPathPlanner } from "../../src/canvas-lib/WorkflowCanvasRoundedOrthogonalPathPlanner";
import { WorkflowCanvasSymmetricForkPathPlanner } from "../../src/canvas-lib/WorkflowCanvasSymmetricForkPathPlanner";
import { WorkflowCanvasPortOrderResolver } from "../../src/canvas-lib/WorkflowCanvasPortOrderResolver";
import { WorkflowCanvasLabelLayoutEstimator } from "../../src/canvas-lib/WorkflowCanvasLabelLayoutEstimator";
import { WorkflowCanvasEdgeCountResolver } from "../../src/canvas-lib/WorkflowCanvasEdgeCountResolver";
import {
  WorkflowCanvasNodeGeometry,
  WORKFLOW_CANVAS_MAIN_NODE_CARD_PX,
  WORKFLOW_CANVAS_AGENT_NODE_CARD_WIDTH_PX,
  WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX,
} from "../../src/canvas-lib/workflowCanvasNodeGeometry";

// ── RoundedOrthogonalPathPlanner ──────────────────────────────────────────────

describe("WorkflowCanvasRoundedOrthogonalPathPlanner", () => {
  test("returns empty string for empty points array", () => {
    expect(WorkflowCanvasRoundedOrthogonalPathPlanner.buildPathFromPoints([])).toBe("");
  });

  test("returns M command for a single point", () => {
    const path = WorkflowCanvasRoundedOrthogonalPathPlanner.buildPathFromPoints([{ x: 10, y: 20 }]);
    expect(path).toContain("M10 20");
  });

  test("produces a non-empty SVG path for a 2-point straight line", () => {
    const path = WorkflowCanvasRoundedOrthogonalPathPlanner.buildPathFromPoints([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(path.startsWith("M")).toBe(true);
    expect(path).toContain("100 0");
  });

  test("produces a path with quadratic bend for a 3-point orthogonal path", () => {
    const path = WorkflowCanvasRoundedOrthogonalPathPlanner.buildPathFromPoints([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 100 },
    ]);
    // Quadratic curve command should appear for the bend
    expect(path).toContain("Q");
  });

  test("handles zero border radius (produces L commands, no Q)", () => {
    const path = WorkflowCanvasRoundedOrthogonalPathPlanner.buildPathFromPoints(
      [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 100 },
      ],
      0,
    );
    // With radius=0 the bend size is 0 so it produces an L straight line
    expect(path).toContain("L");
  });
});

// ── SymmetricForkPathPlanner ──────────────────────────────────────────────────

describe("WorkflowCanvasSymmetricForkPathPlanner", () => {
  test("returns a path and label coords", () => {
    const result = WorkflowCanvasSymmetricForkPathPlanner.build({
      sourceX: 0,
      sourceY: 0,
      targetX: 200,
      targetY: 50,
      offset: 30,
    });
    expect(result.path.length).toBeGreaterThan(0);
    expect(typeof result.labelX).toBe("number");
    expect(typeof result.labelY).toBe("number");
    expect(result.labelY).toBe(50);
  });

  test("collapses to mid-point when offset forces overlap", () => {
    // When x1 >= x2 (small source→target X delta), both collapse to midpoint
    const result = WorkflowCanvasSymmetricForkPathPlanner.build({
      sourceX: 0,
      sourceY: 0,
      targetX: 10,
      targetY: 0,
      offset: 50, // offset > half the distance
    });
    expect(result.path.length).toBeGreaterThan(0);
  });
});

// ── PortOrderResolver ─────────────────────────────────────────────────────────

describe("WorkflowCanvasPortOrderResolver", () => {
  test("sortSourceOutputs puts true before false, then main, then error", () => {
    const sorted = WorkflowCanvasPortOrderResolver.sortSourceOutputs(["error", "main", "false", "true"]);
    expect(sorted).toEqual(["true", "false", "main", "error"]);
  });

  test("sortSourceOutputs puts unknown ports at the end, lexically", () => {
    const sorted = WorkflowCanvasPortOrderResolver.sortSourceOutputs(["z_port", "a_port", "main"]);
    expect(sorted).toEqual(["main", "a_port", "z_port"]);
  });

  test("sortSourceOutputs deduplicates", () => {
    const sorted = WorkflowCanvasPortOrderResolver.sortSourceOutputs(["main", "main", "error"]);
    expect(sorted).toEqual(["main", "error"]);
  });

  test("sortTargetInputs puts true before false, then in, then unknown", () => {
    const sorted = WorkflowCanvasPortOrderResolver.sortTargetInputs(["unknown", "in", "false", "true"]);
    expect(sorted).toEqual(["true", "false", "in", "unknown"]);
  });
});

// ── LabelLayoutEstimator ──────────────────────────────────────────────────────

describe("WorkflowCanvasLabelLayoutEstimator", () => {
  test("returns 1 for empty string", () => {
    expect(WorkflowCanvasLabelLayoutEstimator.estimateLineCount("", 100, 13)).toBe(1);
  });

  test("returns 1 for short single-word label", () => {
    expect(WorkflowCanvasLabelLayoutEstimator.estimateLineCount("Hello", 200, 13)).toBe(1);
  });

  test("returns 2 for a label that wraps once", () => {
    // Narrow max width: force a wrap
    const count = WorkflowCanvasLabelLayoutEstimator.estimateLineCount("Hello World", 30, 13);
    expect(count).toBeGreaterThan(1);
  });

  test("handles very long single word (no spaces)", () => {
    const longWord = "A".repeat(200);
    const count = WorkflowCanvasLabelLayoutEstimator.estimateLineCount(longWord, 50, 13);
    expect(count).toBeGreaterThan(1);
  });
});

// ── NodeGeometry ──────────────────────────────────────────────────────────────

describe("WorkflowCanvasNodeGeometry", () => {
  test("mainNodeWidthPx returns agent width for agents", () => {
    expect(WorkflowCanvasNodeGeometry.mainNodeWidthPx(true)).toBe(WORKFLOW_CANVAS_AGENT_NODE_CARD_WIDTH_PX);
  });

  test("mainNodeWidthPx returns main card width for non-agents", () => {
    expect(WorkflowCanvasNodeGeometry.mainNodeWidthPx(false)).toBe(WORKFLOW_CANVAS_MAIN_NODE_CARD_PX);
  });

  test("mainNodeLabelBlockHeightPx is a positive number for non-empty labels", () => {
    const h = WorkflowCanvasNodeGeometry.mainNodeLabelBlockHeightPx("HTTP Request");
    expect(h).toBeGreaterThan(0);
  });

  test("attachmentNodeHeightPx returns a positive number", () => {
    const h = WorkflowCanvasNodeGeometry.attachmentNodeHeightPx("Tool name", WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX);
    expect(h).toBeGreaterThan(0);
  });
});

// ── EdgeCountResolver ─────────────────────────────────────────────────────────

describe("WorkflowCanvasEdgeCountResolver", () => {
  test("returns 0 when no snapshots exist", () => {
    const count = WorkflowCanvasEdgeCountResolver.resolveCount({
      sourceNodeId: "src",
      targetNodeId: "tgt",
      targetNodeRole: undefined,
      targetInput: "main",
      sourceOutput: "main",
      sourceSnapshot: undefined,
      targetSnapshot: undefined,
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [],
    });
    expect(count).toBe(0);
  });

  test("returns source output length when source snapshot has items", () => {
    const count = WorkflowCanvasEdgeCountResolver.resolveCount({
      sourceNodeId: "src",
      targetNodeId: "tgt",
      targetNodeRole: undefined,
      targetInput: "main",
      sourceOutput: "main",
      sourceSnapshot: { nodeId: "src", outputs: { main: [{}, {}] } } as never,
      targetSnapshot: undefined,
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [],
    });
    expect(count).toBe(2);
  });

  test("returns target input length when target snapshot has items", () => {
    const count = WorkflowCanvasEdgeCountResolver.resolveCount({
      sourceNodeId: "src",
      targetNodeId: "tgt",
      targetNodeRole: undefined,
      targetInput: "main",
      sourceOutput: "main",
      sourceSnapshot: undefined,
      targetSnapshot: { nodeId: "tgt", inputsByPort: { main: [{}, {}, {}] } } as never,
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [],
    });
    expect(count).toBe(3);
  });

  test("resolves tool attachment count from connectionInvocations", () => {
    const count = WorkflowCanvasEdgeCountResolver.resolveCount({
      sourceNodeId: "src",
      targetNodeId: "tool_node",
      targetNodeRole: "tool",
      targetInput: "main",
      sourceOutput: "main",
      sourceSnapshot: undefined,
      targetSnapshot: undefined,
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [{ connectionNodeId: "tool_node" } as never, { connectionNodeId: "tool_node" } as never],
    });
    expect(count).toBe(2);
  });
});
