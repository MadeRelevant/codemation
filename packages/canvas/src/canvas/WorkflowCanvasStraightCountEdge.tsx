import {
  BaseEdge,
  getStraightPath,
  type Edge as ReactFlowEdge,
  type EdgeProps as ReactFlowEdgeProps,
} from "@xyflow/react";

export function StraightCountEdge(props: ReactFlowEdgeProps<ReactFlowEdge>) {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
  });
  return (
    <BaseEdge
      id={props.id}
      path={edgePath}
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
