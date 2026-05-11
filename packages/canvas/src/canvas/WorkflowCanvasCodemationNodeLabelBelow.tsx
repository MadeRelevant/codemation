import type { WorkflowCanvasNodeData } from "./lib/workflowCanvasNodeData";
import {
  WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_FONT_PX,
  WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_GAP_PX,
  WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_LINE_HEIGHT,
  WORKFLOW_CANVAS_MAIN_NODE_LABEL_FONT_PX,
  WORKFLOW_CANVAS_MAIN_NODE_LABEL_GAP_PX,
  WORKFLOW_CANVAS_MAIN_NODE_LABEL_LINE_HEIGHT,
} from "./lib/workflowCanvasNodeGeometry";

export function WorkflowCanvasCodemationNodeLabelBelow(
  props: Readonly<{ data: WorkflowCanvasNodeData; maxWidthPx: number }>,
) {
  const { data, maxWidthPx } = props;
  const isAttachment = data.isAttachment;
  const isMainAgent = !isAttachment && data.role === "agent";
  const isNestedAgent = data.role === "nestedAgent";
  if (isMainAgent || isNestedAgent) {
    return null;
  }
  const fontSize = isAttachment
    ? WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_FONT_PX
    : WORKFLOW_CANVAS_MAIN_NODE_LABEL_FONT_PX;
  const lineHeight = isAttachment
    ? WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_LINE_HEIGHT
    : WORKFLOW_CANVAS_MAIN_NODE_LABEL_LINE_HEIGHT;
  const marginTopPx = isAttachment
    ? WORKFLOW_CANVAS_ATTACHMENT_NODE_LABEL_GAP_PX
    : WORKFLOW_CANVAS_MAIN_NODE_LABEL_GAP_PX;
  return (
    <div
      data-testid={`canvas-node-label-${data.nodeId}`}
      style={{
        width: "100%",
        maxWidth: maxWidthPx,
        marginTop: marginTopPx,
        paddingLeft: 4,
        paddingRight: 4,
        textAlign: "center",
        fontWeight: 700,
        fontSize,
        lineHeight,
        color: "#0f172a",
        whiteSpace: "normal",
        overflowWrap: "anywhere",
        wordBreak: "break-word",
      }}
    >
      {data.label}
    </div>
  );
}
