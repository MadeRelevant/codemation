import { WORKFLOW_CANVAS_MAIN_EDGE_CORNER_RADIUS } from "./workflowCanvasEdgeGeometry";
import { WorkflowCanvasRoundedOrthogonalPathPlanner } from "./WorkflowCanvasRoundedOrthogonalPathPlanner";

/**
 * Orthogonal path for fork edges (one source → many targets) so every branch
 * shares the same first horizontal segment, then drops or rises vertically—mirroring
 * how merge edges converge symmetrically on the right. Corners use the same
 * quadratic smoothing as React Flow smoothstep edges.
 */
export class WorkflowCanvasSymmetricForkPathPlanner {
  static build(
    args: Readonly<{
      sourceX: number;
      sourceY: number;
      targetX: number;
      targetY: number;
      offset: number;
    }>,
  ): Readonly<{ path: string; labelX: number; labelY: number }> {
    const { sourceX, sourceY, targetX, targetY, offset } = args;
    let x1 = sourceX + offset;
    let x2 = targetX - offset;
    if (x1 >= x2 - 0.5) {
      const mid = (sourceX + targetX) / 2;
      x1 = mid;
      x2 = mid;
    }
    const points = [
      { x: sourceX, y: sourceY },
      { x: x1, y: sourceY },
      { x: x1, y: targetY },
      { x: x2, y: targetY },
      { x: targetX, y: targetY },
    ];
    const path = WorkflowCanvasRoundedOrthogonalPathPlanner.buildPathFromPoints(
      points,
      WORKFLOW_CANVAS_MAIN_EDGE_CORNER_RADIUS,
    );
    const labelX = (x1 + x2) / 2;
    const labelY = targetY;
    return { path, labelX, labelY };
  }
}
