import { BaseEdge, type Edge, type EdgeProps } from "@xyflow/react";

import { WORKFLOW_CANVAS_MAIN_EDGE_OFFSET } from "./lib/workflowCanvasEdgeGeometry";
import { WorkflowCanvasSymmetricForkPathPlanner } from "./lib/WorkflowCanvasSymmetricForkPathPlanner";

export function WorkflowCanvasSymmetricForkEdge(props: EdgeProps<Edge>) {
  const { path, labelX, labelY } = WorkflowCanvasSymmetricForkPathPlanner.build({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    offset: WORKFLOW_CANVAS_MAIN_EDGE_OFFSET,
  });
  return (
    <BaseEdge
      id={props.id}
      path={path}
      markerEnd={props.markerEnd}
      markerStart={props.markerStart}
      style={props.style}
      label={props.label}
      labelX={labelX}
      labelY={labelY + 16}
      labelStyle={props.labelStyle}
      labelShowBg
      labelBgStyle={props.labelBgStyle}
      labelBgPadding={props.labelBgPadding}
      labelBgBorderRadius={props.labelBgBorderRadius}
      interactionWidth={props.interactionWidth}
    />
  );
}
