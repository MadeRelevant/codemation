import { describe, expect, it } from "vitest";

import {
  WORKFLOW_CANVAS_AGENT_NODE_CARD_WIDTH_PX,
  WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX,
  WORKFLOW_CANVAS_ATTACHMENT_STACK_GAP_PX,
  WORKFLOW_CANVAS_MAIN_NODE_CARD_PX,
  WorkflowCanvasNodeGeometry,
} from "../../src/features/workflows/components/canvas/lib/workflowCanvasNodeGeometry";

describe("WorkflowCanvasNodeGeometry", () => {
  it("mainNodeWidthPx is wider for AI Agent than for standard nodes", () => {
    expect(WorkflowCanvasNodeGeometry.mainNodeWidthPx(true)).toBe(WORKFLOW_CANVAS_AGENT_NODE_CARD_WIDTH_PX);
    expect(WorkflowCanvasNodeGeometry.mainNodeWidthPx(false)).toBe(WORKFLOW_CANVAS_MAIN_NODE_CARD_PX);
    expect(WORKFLOW_CANVAS_AGENT_NODE_CARD_WIDTH_PX).toBeGreaterThan(WORKFLOW_CANVAS_MAIN_NODE_CARD_PX);
  });

  it("attachmentCardCenterYDeltaFromParentCardCenter grows with label height (non-agent)", () => {
    const short = WorkflowCanvasNodeGeometry.attachmentCardCenterYDeltaFromParentCardCenter("A", false);
    const long = WorkflowCanvasNodeGeometry.attachmentCardCenterYDeltaFromParentCardCenter(
      "Very long multi-line label text that wraps",
      false,
    );
    expect(long).toBeGreaterThan(short);
  });

  it("attachmentCardCenterYDeltaFromParentCardCenter is independent of label length for agent (inline title)", () => {
    const short = WorkflowCanvasNodeGeometry.attachmentCardCenterYDeltaFromParentCardCenter("A", true);
    const long = WorkflowCanvasNodeGeometry.attachmentCardCenterYDeltaFromParentCardCenter(
      "Very long multi-line label text that wraps",
      true,
    );
    expect(long).toBe(short);
  });

  it("attachment row delta uses card centers (constant card sizes)", () => {
    const d = WorkflowCanvasNodeGeometry.attachmentCardCenterYDeltaFromParentCardCenter("X", false);
    const base =
      WORKFLOW_CANVAS_MAIN_NODE_CARD_PX / 2 +
      WorkflowCanvasNodeGeometry.verticalExtentBelowParentMainCard("X", false) +
      WORKFLOW_CANVAS_ATTACHMENT_STACK_GAP_PX +
      WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX / 2;
    expect(d).toBe(base);
  });
});
