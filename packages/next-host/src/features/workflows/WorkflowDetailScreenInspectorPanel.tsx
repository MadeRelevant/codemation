import { PanelBottomClose,PanelBottomOpen } from "lucide-react";

import { WorkflowExecutionInspector } from "./workflowDetail/WorkflowExecutionInspector";
import type { WorkflowDetailControllerResult } from "./workflowDetail/useWorkflowDetailController";

export function WorkflowDetailScreenInspectorPanel(props: Readonly<{ controller: WorkflowDetailControllerResult }>) {
  const { controller } = props;
  return (
    <div style={{ minWidth: 0, minHeight: 0, background: "white", display: "grid", gridTemplateRows: controller.isPanelCollapsed ? "36px" : "36px minmax(0, 1fr)", borderTop: "1px solid #d1d5db" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          padding: "0 10px 0 12px",
          cursor: "ns-resize",
          userSelect: "none",
          borderBottom: controller.isPanelCollapsed ? "none" : "1px solid #e5e7eb",
          background: "#fff",
        }}
        onMouseDown={(event) => controller.startInspectorResize(event.clientY)}
      >
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", opacity: 0.72 }}>Execution inspector</div>
        <button
          onClick={(event) => {
            event.stopPropagation();
            controller.toggleInspectorPanel();
          }}
          aria-label={controller.isPanelCollapsed ? "Open execution inspector" : "Collapse execution inspector"}
          style={{
            width: 28,
            height: 28,
            border: "1px solid #9ca3af",
            outline: "1px solid #e5e7eb",
            outlineOffset: "-2px",
            background: "white",
            color: "#111827",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
          }}
        >
          {controller.isPanelCollapsed ? <PanelBottomOpen size={15} strokeWidth={1.9} /> : <PanelBottomClose size={15} strokeWidth={1.9} />}
        </button>
      </div>
      {!controller.isPanelCollapsed ? (
        <div style={{ minWidth: 0, minHeight: 0, overflow: "hidden" }}>
          <WorkflowExecutionInspector model={controller.inspectorModel} formatting={controller.inspectorFormatting} actions={controller.inspectorActions} />
        </div>
      ) : null}
    </div>
  );
}
