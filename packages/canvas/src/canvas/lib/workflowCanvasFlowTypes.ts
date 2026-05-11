import { CodemationNode } from "../WorkflowCanvasCodemationNode";
import { StraightCountEdge } from "../WorkflowCanvasStraightCountEdge";
import { WorkflowCanvasSymmetricForkEdge } from "../WorkflowCanvasSymmetricForkEdge";

export const workflowCanvasNodeTypes = { codemation: CodemationNode };

export const workflowCanvasEdgeTypes = {
  straightCount: StraightCountEdge,
  symmetricFork: WorkflowCanvasSymmetricForkEdge,
};
