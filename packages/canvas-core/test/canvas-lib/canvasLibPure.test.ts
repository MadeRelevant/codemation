/**
 * Tests for pure canvas-lib logic: path planners, geometry, label estimator, port ordering, edge counts.
 * These run in node env (no DOM required — all pure functions/class statics).
 */
import { describe, expect, test } from "vitest";

import { WorkflowCanvasSiIconRegistry } from "../../src/canvas-lib/WorkflowCanvasSiIconRegistry";

import { WorkflowCanvasRoundedOrthogonalPathPlanner } from "../../src/canvas-lib/WorkflowCanvasRoundedOrthogonalPathPlanner";
import { WorkflowCanvasSymmetricForkPathPlanner } from "../../src/canvas-lib/WorkflowCanvasSymmetricForkPathPlanner";
import { WorkflowCanvasPortOrderResolver } from "../../src/canvas-lib/WorkflowCanvasPortOrderResolver";
import { WorkflowCanvasLabelLayoutEstimator } from "../../src/canvas-lib/WorkflowCanvasLabelLayoutEstimator";
import { WorkflowCanvasEdgeCountResolver } from "../../src/canvas-lib/WorkflowCanvasEdgeCountResolver";
import { WorkflowCanvasEdgeStyleResolver } from "../../src/canvas-lib/WorkflowCanvasEdgeStyleResolver";
import { WorkflowCanvasBuiltinIconRegistry } from "../../src/canvas-lib/WorkflowCanvasBuiltinIconRegistry";
import { WorkflowCanvasLucideIconRegistry } from "../../src/canvas-lib/WorkflowCanvasLucideIconRegistry";
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

// ── SiIconRegistry ────────────────────────────────────────────────────────────

describe("WorkflowCanvasSiIconRegistry", () => {
  test("resolves the gmail icon by slug to a URL", () => {
    const url = WorkflowCanvasSiIconRegistry.resolve("gmail");
    expect(url).toBeDefined();
    expect(url).toContain("/api/si-icon/");
    expect(url).toContain("gmail");
  });

  test("returns undefined for an unknown slug", () => {
    expect(WorkflowCanvasSiIconRegistry.resolve("nonexistent-slug-xyz")).toBeUndefined();
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

  test("falls back to nodeSnapshotsByNodeId count when no connectionInvocations match for languageModel", () => {
    const count = WorkflowCanvasEdgeCountResolver.resolveCount({
      sourceNodeId: "src",
      targetNodeId: "llm_node",
      targetNodeRole: "languageModel",
      targetInput: "main",
      sourceOutput: "main",
      sourceSnapshot: undefined,
      targetSnapshot: undefined,
      nodeSnapshotsByNodeId: {
        "snap-1": { nodeId: "llm_node" } as never,
        "snap-2": { nodeId: "llm_node" } as never,
      },
      connectionInvocations: [],
    });
    expect(count).toBe(2);
  });

  test("falls back to nodeSnapshotsByNodeId for nestedAgent role", () => {
    const count = WorkflowCanvasEdgeCountResolver.resolveCount({
      sourceNodeId: "src",
      targetNodeId: "agent_node",
      targetNodeRole: "nestedAgent",
      targetInput: "main",
      sourceOutput: "main",
      sourceSnapshot: undefined,
      targetSnapshot: undefined,
      nodeSnapshotsByNodeId: {
        "snap-1": { nodeId: "agent_node" } as never,
      },
      connectionInvocations: [],
    });
    expect(count).toBe(1);
  });
});

// ── EdgeStyleResolver ─────────────────────────────────────────────────────────

describe("WorkflowCanvasEdgeStyleResolver", () => {
  test("resolveStrokeColor returns active main for main edge with items", () => {
    const color = WorkflowCanvasEdgeStyleResolver.resolveStrokeColor({ edgeItemCount: 1, isAttachmentEdge: false });
    expect(typeof color).toBe("string");
    expect(color.length).toBeGreaterThan(0);
  });

  test("resolveStrokeColor returns inactive main for main edge with 0 items", () => {
    const active = WorkflowCanvasEdgeStyleResolver.resolveStrokeColor({ edgeItemCount: 5, isAttachmentEdge: false });
    const inactive = WorkflowCanvasEdgeStyleResolver.resolveStrokeColor({ edgeItemCount: 0, isAttachmentEdge: false });
    expect(active).not.toBe(inactive);
  });

  test("resolveStrokeColor returns different color for attachment edge", () => {
    const main = WorkflowCanvasEdgeStyleResolver.resolveStrokeColor({ edgeItemCount: 1, isAttachmentEdge: false });
    const attachment = WorkflowCanvasEdgeStyleResolver.resolveStrokeColor({ edgeItemCount: 1, isAttachmentEdge: true });
    expect(main).not.toBe(attachment);
  });

  test("resolveStrokeColor inactive attachment differs from inactive main", () => {
    const main = WorkflowCanvasEdgeStyleResolver.resolveStrokeColor({ edgeItemCount: 0, isAttachmentEdge: false });
    const attachment = WorkflowCanvasEdgeStyleResolver.resolveStrokeColor({ edgeItemCount: 0, isAttachmentEdge: true });
    expect(main).not.toBe(attachment);
  });

  test("resolveLabelFill returns a string for all combos", () => {
    for (const edgeItemCount of [0, 1]) {
      for (const isAttachmentEdge of [false, true]) {
        const fill = WorkflowCanvasEdgeStyleResolver.resolveLabelFill({ edgeItemCount, isAttachmentEdge });
        expect(typeof fill).toBe("string");
        expect(fill.length).toBeGreaterThan(0);
      }
    }
  });

  test("resolveLabelBackground returns a string for all combos", () => {
    for (const edgeItemCount of [0, 1]) {
      for (const isAttachmentEdge of [false, true]) {
        const bg = WorkflowCanvasEdgeStyleResolver.resolveLabelBackground({ edgeItemCount, isAttachmentEdge });
        expect(typeof bg).toBe("string");
        expect(bg.startsWith("rgba")).toBe(true);
      }
    }
  });
});

// ── BuiltinIconRegistry ────────────────────────────────────────────────────────

describe("WorkflowCanvasBuiltinIconRegistry", () => {
  test("resolveUrl returns URL for known builtin 'openai'", () => {
    const url = WorkflowCanvasBuiltinIconRegistry.resolveUrl("openai");
    expect(url).toBeDefined();
    expect(url).toContain("openai.svg");
  });

  test("resolveUrl returns undefined for unknown id", () => {
    expect(WorkflowCanvasBuiltinIconRegistry.resolveUrl("nonexistent-brand-xyz")).toBeUndefined();
  });

  test("resolveUrl is case-insensitive (trims and lowercases)", () => {
    const lower = WorkflowCanvasBuiltinIconRegistry.resolveUrl("openai");
    const upper = WorkflowCanvasBuiltinIconRegistry.resolveUrl("OPENAI");
    expect(lower).toBe(upper);
  });

  test("has() returns true for known builtin", () => {
    expect(WorkflowCanvasBuiltinIconRegistry.has("openai")).toBe(true);
    expect(WorkflowCanvasBuiltinIconRegistry.has("split-rows")).toBe(true);
  });

  test("has() returns false for unknown id", () => {
    expect(WorkflowCanvasBuiltinIconRegistry.has("nonexistent-xyz")).toBe(false);
  });
});

// ── LucideIconRegistry ─────────────────────────────────────────────────────────

describe("WorkflowCanvasLucideIconRegistry", () => {
  test("has() returns true for a registered icon", () => {
    expect(WorkflowCanvasLucideIconRegistry.has("bot")).toBe(true);
    expect(WorkflowCanvasLucideIconRegistry.has("webhook")).toBe(true);
  });

  test("has() returns false for an unregistered icon", () => {
    expect(WorkflowCanvasLucideIconRegistry.has("nonexistent-icon-xyz")).toBe(false);
  });

  test("resolve() returns a non-null value for a registered icon", () => {
    const component = WorkflowCanvasLucideIconRegistry.resolve("bot");
    expect(component).not.toBeNull();
  });

  test("resolve() returns null for an unregistered icon", () => {
    expect(WorkflowCanvasLucideIconRegistry.resolve("nonexistent-icon-xyz")).toBeNull();
  });
});

// ── Extended NodeGeometry ──────────────────────────────────────────────────────

describe("WorkflowCanvasNodeGeometry (extended)", () => {
  test("nestedAgentNodeWidthPx returns a positive number", () => {
    expect(WorkflowCanvasNodeGeometry.nestedAgentNodeWidthPx()).toBeGreaterThan(0);
  });

  test("agentShellBelowCardPx returns a positive number", () => {
    expect(WorkflowCanvasNodeGeometry.agentShellBelowCardPx()).toBeGreaterThan(0);
  });

  test("mainNodeHeightPx for agent includes badge row, no label", () => {
    const agentHeight = WorkflowCanvasNodeGeometry.mainNodeHeightPx("Test Agent", true);
    const nonAgentHeight = WorkflowCanvasNodeGeometry.mainNodeHeightPx("Test Node", false);
    // Both are positive
    expect(agentHeight).toBeGreaterThan(0);
    expect(nonAgentHeight).toBeGreaterThan(0);
  });

  test("mainNodeHeightPx for non-agent includes label block", () => {
    const h = WorkflowCanvasNodeGeometry.mainNodeHeightPx("A label", false);
    expect(h).toBeGreaterThan(WORKFLOW_CANVAS_MAIN_NODE_CARD_PX);
  });

  test("attachmentNodeWidthPx returns attachment card px", () => {
    expect(WorkflowCanvasNodeGeometry.attachmentNodeWidthPx()).toBe(WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX);
  });

  test("attachmentNodeLabelBlockHeightPx returns positive for non-empty label", () => {
    const h = WorkflowCanvasNodeGeometry.attachmentNodeLabelBlockHeightPx("Tool name");
    expect(h).toBeGreaterThan(0);
  });

  test("verticalExtentBelowParentMainCard returns positive for non-agent", () => {
    const v = WorkflowCanvasNodeGeometry.verticalExtentBelowParentMainCard("My label", false);
    expect(v).toBeGreaterThan(0);
  });

  test("verticalExtentBelowParentMainCard for agent includes badge row only", () => {
    const agent = WorkflowCanvasNodeGeometry.verticalExtentBelowParentMainCard("Agent", true);
    const nonAgent = WorkflowCanvasNodeGeometry.verticalExtentBelowParentMainCard("Node", false);
    // Both positive, they can differ
    expect(agent).toBeGreaterThan(0);
    expect(nonAgent).toBeGreaterThan(0);
  });

  test("attachmentCardCenterYDeltaFromParentCardCenter returns a positive delta", () => {
    const delta = WorkflowCanvasNodeGeometry.attachmentCardCenterYDeltaFromParentCardCenter("Parent", false);
    expect(delta).toBeGreaterThan(0);
  });

  test("attachmentCardCenterYDeltaFromParentCardCenter with custom half-height", () => {
    const delta = WorkflowCanvasNodeGeometry.attachmentCardCenterYDeltaFromParentCardCenter("Parent", false, 50);
    expect(delta).toBeGreaterThan(0);
  });
});

// ── Extended LabelLayoutEstimator ─────────────────────────────────────────────

describe("WorkflowCanvasLabelLayoutEstimator (extended)", () => {
  test("word wider than maxWidth is split across multiple lines", () => {
    // A single very long word that won't fit in a narrow width
    const longWord = "A".repeat(100);
    const count = WorkflowCanvasLabelLayoutEstimator.estimateLineCount(longWord, 30, 13);
    expect(count).toBeGreaterThan(1);
  });

  test("word wider than maxWidth when preceded by other content creates extra line", () => {
    // First word fits, second word is very long — triggers the lineWidthPx > 0 branch
    const text = "Hi " + "B".repeat(100);
    const count = WorkflowCanvasLabelLayoutEstimator.estimateLineCount(text, 30, 13);
    expect(count).toBeGreaterThan(2);
  });
});
