import { WorkflowCanvasLabelLayoutEstimator } from "./WorkflowCanvasLabelLayoutEstimator";

/** Main workflow node: square card + optional agent badge row + label strip below (React Flow node bounds). ~10% larger than initial canvas revision. */
export const WORKFLOW_CANVAS_MAIN_NODE_CARD_PX = 92;
/** AI Agent: wider card with the node title inline next to the icon (no separate label strip below the card). */
export const WORKFLOW_CANVAS_AGENT_NODE_CARD_WIDTH_PX = 220;
export const WORKFLOW_CANVAS_MAIN_NODE_LABEL_GAP_PX = 5;
export const WORKFLOW_CANVAS_MAIN_NODE_ICON_PX = 22;
/** Unified stroke for Lucide canvas glyphs (matches visual weight of filled brand marks). */
export const WORKFLOW_CANVAS_NODE_ICON_STROKE_WIDTH = 2;
export const WORKFLOW_CANVAS_MAIN_NODE_LABEL_FONT_PX = 13;
export const WORKFLOW_CANVAS_MAIN_NODE_LABEL_LINE_HEIGHT = 1.25;

/** Attachment nodes (LLM/tools): smaller square + label below. */
export const WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX = 74;
export const WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_GAP_PX = 5;
/** Proportional to main card icon (~22×74/92); keeps attachment row readable vs main row. */
export const WORKFLOW_CANVAS_ATTACHMENT_NODE_ICON_PX = 18;
export const WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_FONT_PX = 12;
export const WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_LINE_HEIGHT = 1.25;

/** Horizontal padding inside label (matches LabelBelow padding). */
export const WORKFLOW_CANVAS_LABEL_HORIZONTAL_PADDING_PX = 9;

/** In-flow row under agent card for LLM / Tools chips (see WorkflowCanvasCodemationNodeAgentLabels). */
export const WORKFLOW_CANVAS_AGENT_BADGE_ROW_PX = 24;

/** Vertical gap between main node bottom and attachment row center line (layout). Extra slack so edges clear agent labels/badges. */
export const WORKFLOW_CANVAS_ATTACHMENT_STACK_GAP_PX = 50;

export class WorkflowCanvasNodeGeometry {
  static mainNodeWidthPx(isAgent: boolean): number {
    return isAgent ? WORKFLOW_CANVAS_AGENT_NODE_CARD_WIDTH_PX : WORKFLOW_CANVAS_MAIN_NODE_CARD_PX;
  }

  static mainNodeLabelBlockHeightPx(label: string): number {
    const maxW = Math.max(32, WORKFLOW_CANVAS_MAIN_NODE_CARD_PX - WORKFLOW_CANVAS_LABEL_HORIZONTAL_PADDING_PX);
    const lines = WorkflowCanvasLabelLayoutEstimator.estimateLineCount(
      label,
      maxW,
      WORKFLOW_CANVAS_MAIN_NODE_LABEL_FONT_PX,
    );
    const lineHeightPx = WORKFLOW_CANVAS_MAIN_NODE_LABEL_FONT_PX * WORKFLOW_CANVAS_MAIN_NODE_LABEL_LINE_HEIGHT;
    return lines * lineHeightPx + 2;
  }

  static mainNodeHeightPx(label: string, isAgent: boolean): number {
    const badge = isAgent ? WORKFLOW_CANVAS_AGENT_BADGE_ROW_PX : 0;
    const labelBelowCard = isAgent ? 0 : this.mainNodeLabelBlockHeightPx(label);
    return WORKFLOW_CANVAS_MAIN_NODE_CARD_PX + WORKFLOW_CANVAS_MAIN_NODE_LABEL_GAP_PX + badge + labelBelowCard;
  }

  static attachmentNodeWidthPx(): number {
    return WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX;
  }

  static attachmentNodeLabelBlockHeightPx(label: string): number {
    const maxW = Math.max(28, WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX - WORKFLOW_CANVAS_LABEL_HORIZONTAL_PADDING_PX);
    const lines = WorkflowCanvasLabelLayoutEstimator.estimateLineCount(
      label,
      maxW,
      WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_FONT_PX,
    );
    const lineHeightPx =
      WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_FONT_PX * WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_LINE_HEIGHT;
    return lines * lineHeightPx + 2;
  }

  static attachmentNodeHeightPx(label: string): number {
    return (
      WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX +
      WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_GAP_PX +
      this.attachmentNodeLabelBlockHeightPx(label)
    );
  }

  /**
   * Vertical distance from the bottom of the main node card to the bottom of the shell content
   * (gap, optional agent badge row, label block). Used to place attachment card centers from the
   * parent card center when Dagre aligns by card square only.
   */
  static verticalExtentBelowParentMainCard(parentLabel: string, parentIsAgent: boolean): number {
    const badge = parentIsAgent ? WORKFLOW_CANVAS_AGENT_BADGE_ROW_PX : 0;
    const labelBelowCard = parentIsAgent ? 0 : this.mainNodeLabelBlockHeightPx(parentLabel);
    return WORKFLOW_CANVAS_MAIN_NODE_LABEL_GAP_PX + badge + labelBelowCard;
  }

  /**
   * Delta Y from parent main-node **card center** to child attachment **card center** (siblings share one row).
   * @param childAttachmentCardHalfHeightPx Half the child attachment card height (main card for nested agents, small card for tools/LLM).
   */
  static attachmentCardCenterYDeltaFromParentCardCenter(
    parentLabel: string,
    parentIsAgent: boolean,
    childAttachmentCardHalfHeightPx: number = WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX / 2,
  ): number {
    return (
      WORKFLOW_CANVAS_MAIN_NODE_CARD_PX / 2 +
      this.verticalExtentBelowParentMainCard(parentLabel, parentIsAgent) +
      WORKFLOW_CANVAS_ATTACHMENT_STACK_GAP_PX +
      childAttachmentCardHalfHeightPx
    );
  }
}
