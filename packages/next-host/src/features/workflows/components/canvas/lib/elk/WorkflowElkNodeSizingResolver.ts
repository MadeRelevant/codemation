import type { WorkflowDto } from "../../../../lib/realtime/workflowTypes";
import {
  WORKFLOW_CANVAS_AGENT_NODE_CARD_WIDTH_PX,
  WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX,
  WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_GAP_PX,
  WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_SLOT_PX,
  WORKFLOW_CANVAS_MAIN_NODE_CARD_PX,
  WORKFLOW_CANVAS_MAIN_NODE_LABEL_GAP_PX,
  WORKFLOW_CANVAS_MAIN_NODE_LABEL_SLOT_PX,
  WORKFLOW_CANVAS_NESTED_AGENT_NODE_CARD_WIDTH_PX,
  WorkflowCanvasNodeGeometry,
} from "../workflowCanvasNodeGeometry";

export type WorkflowElkNodeSizing = Readonly<{
  widthPx: number;
  heightPx: number;
  /** Height of the rendered card square/rectangle (without label/badge slot below). Drives FIXED_POS port Y. */
  cardHeightPx: number;
}>;

/**
 * Resolves ELK layout dimensions for every workflow node.
 *
 * The "card" is the visible square/rectangle; labels render in a fixed slot
 * below the card and agents get a small LLM / TOOLS chip row instead. Both
 * are included in `heightPx` so ELK reserves enough vertical space for them,
 * but they're held to a **fixed** slot size per role — never derived from
 * label text length — so horizontal chains stay straight (the FIXED_POS port
 * is anchored to `cardHeightPx / 2`, which is uniform per role).
 */
export class WorkflowElkNodeSizingResolver {
  static resolve(workflow: WorkflowDto): Map<string, WorkflowElkNodeSizing> {
    const out = new Map<string, WorkflowElkNodeSizing>();
    for (const node of workflow.nodes) {
      const isAgent = node.role === "agent";
      const isNestedAgent = node.role === "nestedAgent";
      if (isAgent || isNestedAgent) {
        const widthPx = isNestedAgent
          ? WORKFLOW_CANVAS_NESTED_AGENT_NODE_CARD_WIDTH_PX
          : WORKFLOW_CANVAS_AGENT_NODE_CARD_WIDTH_PX;
        const cardHeightPx = WORKFLOW_CANVAS_MAIN_NODE_CARD_PX;
        const heightPx = cardHeightPx + WorkflowCanvasNodeGeometry.agentShellBelowCardPx();
        out.set(node.id, { widthPx, heightPx, cardHeightPx });
        continue;
      }
      if (node.parentNodeId) {
        const cardHeightPx = WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX;
        const heightPx =
          cardHeightPx + WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_GAP_PX + WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_SLOT_PX;
        out.set(node.id, {
          widthPx: WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX,
          heightPx,
          cardHeightPx,
        });
        continue;
      }
      const cardHeightPx = WORKFLOW_CANVAS_MAIN_NODE_CARD_PX;
      const heightPx =
        cardHeightPx + WORKFLOW_CANVAS_MAIN_NODE_LABEL_GAP_PX + WORKFLOW_CANVAS_MAIN_NODE_LABEL_SLOT_PX;
      out.set(node.id, {
        widthPx: WORKFLOW_CANVAS_MAIN_NODE_CARD_PX,
        heightPx,
        cardHeightPx,
      });
    }
    return out;
  }
}
