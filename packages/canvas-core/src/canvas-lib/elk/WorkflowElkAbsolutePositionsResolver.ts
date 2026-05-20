import type { ElkNode } from "elkjs/lib/elk.bundled.js";

import type { WorkflowElkNodeSizing } from "./WorkflowElkNodeSizingResolver";

export type WorkflowAbsolutePosition = Readonly<{ x: number; y: number }>;

/**
 * Walks the positioned ElkNode tree and produces a flat
 * `nodeId → absolute position` map. Compound parents shift their card to the
 * group center, matching what `WorkflowElkResultMapper` previously did inline.
 *
 * Split out so the synchronous React Flow mapper can consume pre-computed
 * positions without re-running this walk on every snapshot update.
 */
export class WorkflowElkAbsolutePositionsResolver {
  static resolve(
    elkRoot: ElkNode,
    sizingByNodeId: ReadonlyMap<string, WorkflowElkNodeSizing>,
  ): ReadonlyMap<string, WorkflowAbsolutePosition> {
    const positionsByNodeId = new Map<string, WorkflowAbsolutePosition>();
    const rootChildren = elkRoot.children ?? [];
    for (const child of rootChildren) {
      this.walkAndRecordPositions(child, 0, 0, sizingByNodeId, positionsByNodeId);
    }
    return positionsByNodeId;
  }

  private static walkAndRecordPositions(
    elkNode: ElkNode,
    offsetX: number,
    offsetY: number,
    sizingByNodeId: ReadonlyMap<string, WorkflowElkNodeSizing>,
    positionsOut: Map<string, WorkflowAbsolutePosition>,
  ): void {
    const nodeX = (elkNode.x ?? 0) + offsetX;
    const nodeY = (elkNode.y ?? 0) + offsetY;
    const elkWidth = elkNode.width ?? 0;
    const sizing = sizingByNodeId.get(elkNode.id);
    const cardWidth = sizing?.widthPx ?? elkWidth;

    const elkChildren = elkNode.children ?? [];
    const isCompoundParent = elkChildren.length > 0;
    const cardHorizontalOffset = isCompoundParent ? Math.max(0, (elkWidth - cardWidth) / 2) : 0;

    positionsOut.set(elkNode.id, { x: nodeX + cardHorizontalOffset, y: nodeY });

    for (const child of elkChildren) {
      this.walkAndRecordPositions(child, nodeX, nodeY, sizingByNodeId, positionsOut);
    }
  }
}
