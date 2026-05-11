import { WORKFLOW_CANVAS_MAIN_EDGE_CORNER_RADIUS } from "./workflowCanvasEdgeGeometry";

type XY = Readonly<{ x: number; y: number }>;

/**
 * Same corner treatment as React Flow's {@link getSmoothStepPath} (quadratic bends at
 * orthogonal joints) applied to an explicit polyline—used for symmetric fork edges.
 */
export class WorkflowCanvasRoundedOrthogonalPathPlanner {
  static buildPathFromPoints(
    points: ReadonlyArray<XY>,
    borderRadius: number = WORKFLOW_CANVAS_MAIN_EDGE_CORNER_RADIUS,
  ): string {
    if (points.length === 0) {
      return "";
    }
    return points.reduce((res, p, i) => {
      let segment = "";
      if (i > 0 && i < points.length - 1) {
        const prev = points[i - 1];
        const next = points[i + 1];
        if (prev && next) {
          segment = WorkflowCanvasRoundedOrthogonalPathPlanner.bend(prev, p, next, borderRadius);
        }
      } else {
        segment = `${i === 0 ? "M" : "L"}${p.x} ${p.y}`;
      }
      return res + segment;
    }, "");
  }

  private static distance(a: XY, b: XY): number {
    return Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  }

  /** Ported from @xyflow/system getBend (smoothstep-edge). */
  private static bend(a: XY, b: XY, c: XY, size: number): string {
    const bendSize = Math.min(
      WorkflowCanvasRoundedOrthogonalPathPlanner.distance(a, b) / 2,
      WorkflowCanvasRoundedOrthogonalPathPlanner.distance(b, c) / 2,
      size,
    );
    const { x, y } = b;
    if ((a.x === x && x === c.x) || (a.y === y && y === c.y)) {
      return `L${x} ${y}`;
    }
    if (a.y === y) {
      const xDir = a.x < c.x ? -1 : 1;
      const yDir = a.y < c.y ? 1 : -1;
      return `L ${x + bendSize * xDir},${y}Q ${x},${y} ${x},${y + bendSize * yDir}`;
    }
    const xDir = a.x < c.x ? 1 : -1;
    const yDir = a.y < c.y ? -1 : 1;
    return `L ${x},${y + bendSize * yDir}Q ${x},${y} ${x + bendSize * xDir},${y}`;
  }
}
