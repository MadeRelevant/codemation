import type { WorkflowCanvasNodeData } from "./lib/workflowCanvasNodeData";
import {
  WORKFLOW_CANVAS_MAIN_NODE_LABEL_FONT_PX,
  WORKFLOW_CANVAS_NODE_ICON_STROKE_WIDTH,
} from "./lib/workflowCanvasNodeGeometry";
import { WorkflowCanvasNodeIcon } from "./WorkflowCanvasNodeIcon";

export function WorkflowCanvasCodemationNodeMainGlyph(
  props: Readonly<{ data: WorkflowCanvasNodeData; iconPx: number; isAgentInlineTitle: boolean }>,
) {
  const { data, iconPx, isAgentInlineTitle } = props;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: isAgentInlineTitle ? "flex-start" : "center",
        paddingLeft: isAgentInlineTitle ? 12 : 0,
        paddingRight: isAgentInlineTitle ? 12 : 0,
        gap: isAgentInlineTitle ? 8 : 0,
        pointerEvents: "none",
        zIndex: 1,
        backgroundColor: "transparent",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          flexShrink: 0,
          alignItems: "center",
          justifyContent: "center",
          width: isAgentInlineTitle ? undefined : "100%",
          height: isAgentInlineTitle ? undefined : "100%",
          flex: isAgentInlineTitle ? undefined : "1 1 auto",
        }}
      >
        <WorkflowCanvasNodeIcon icon={data.icon} sizePx={iconPx} strokeWidth={WORKFLOW_CANVAS_NODE_ICON_STROKE_WIDTH} />
      </div>
      {isAgentInlineTitle ? (
        <span
          data-testid={`canvas-node-inline-title-${data.nodeId}`}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: WORKFLOW_CANVAS_MAIN_NODE_LABEL_FONT_PX,
            fontWeight: 700,
            lineHeight: 1.2,
            color: "#0f172a",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            textAlign: "left",
          }}
        >
          {data.label}
        </span>
      ) : null}
    </div>
  );
}
