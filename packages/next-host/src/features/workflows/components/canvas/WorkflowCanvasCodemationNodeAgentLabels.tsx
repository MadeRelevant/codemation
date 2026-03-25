import { WORKFLOW_CANVAS_AGENT_BADGE_ROW_PX } from "./lib/workflowCanvasNodeGeometry";

export function WorkflowCanvasCodemationNodeAgentLabels() {
  const chip = (color: string, border: string, bg: string, text: string) => (
    <div
      style={{
        padding: "2px 6px",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.35,
        textTransform: "uppercase",
        color,
        background: bg,
        border: `1px dotted ${border}`,
        whiteSpace: "nowrap",
        borderRadius: 4,
      }}
    >
      {text}
    </div>
  );
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        width: "100%",
        minHeight: WORKFLOW_CANVAS_AGENT_BADGE_ROW_PX,
        paddingLeft: 4,
        paddingRight: 4,
        boxSizing: "border-box",
        pointerEvents: "none",
      }}
      aria-hidden
    >
      <div style={{ flex: "1 1 0", display: "flex", justifyContent: "center", minWidth: 0 }}>
        {chip("#1d4ed8", "#93c5fd", "#eff6ff", "LLM")}
      </div>
      <div style={{ flex: "1 1 0", display: "flex", justifyContent: "center", minWidth: 0 }}>
        {chip("#6d28d9", "#c4b5fd", "#f5f3ff", "Tools")}
      </div>
    </div>
  );
}
