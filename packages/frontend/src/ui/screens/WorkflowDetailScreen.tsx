import { PanelBottomClose, PanelBottomOpen } from "lucide-react";
import type { WorkflowDto } from "../realtime/realtime";
import { WorkflowCanvas } from "../components/WorkflowCanvas";
import { WorkflowExecutionInspector } from "../workflowDetail/WorkflowExecutionInspector";
import { WorkflowJsonEditorDialog } from "../workflowDetail/WorkflowJsonEditorDialog";
import { WorkflowRunsSidebar } from "../workflowDetail/WorkflowRunsSidebar";
import { useWorkflowDetailController } from "../workflowDetail/useWorkflowDetailController";

const WORKFLOW_DETAIL_TREE_STYLES = `
  @keyframes codemationSpin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .codemation-execution-tree,
  .codemation-json-tree {
    background: transparent;
    border: none;
  }

  .codemation-execution-tree .rc-tree-node-content-wrapper,
  .codemation-json-tree .rc-tree-node-content-wrapper {
    display: inline-block;
    width: calc(100% - 18px);
    height: auto;
    padding: 0;
    line-height: 1.2;
    vertical-align: top;
  }

  .codemation-execution-tree .rc-tree-switcher,
  .codemation-json-tree .rc-tree-switcher {
    width: 12px;
    margin-right: 6px;
  }

  .codemation-execution-tree .rc-tree-treenode,
  .codemation-json-tree .rc-tree-treenode {
    padding: 0 0 4px;
    line-height: normal;
  }

  .codemation-execution-tree .rc-tree-treenode {
    white-space: nowrap;
  }

  .codemation-json-tree .rc-tree-treenode {
    white-space: normal;
  }

  .codemation-execution-tree .rc-tree-title,
  .codemation-json-tree .rc-tree-title {
    display: block;
    width: 100%;
  }

  .codemation-execution-tree .rc-tree-treenode ul,
  .codemation-json-tree .rc-tree-treenode ul {
    padding-left: 20px;
  }

  .codemation-execution-tree .rc-tree-node-selected {
    background: transparent;
    box-shadow: none;
    opacity: 1;
  }

  .codemation-execution-tree .rc-tree-node-content-wrapper:hover,
  .codemation-json-tree .rc-tree-node-content-wrapper:hover {
    background: transparent;
  }
`;

export function WorkflowDetailScreen(args: Readonly<{ workflowId: string; initialWorkflow?: WorkflowDto }>) {
  const controller = useWorkflowDetailController(args);
  const activeCanvasTab = controller.isRunsPaneVisible ? "executions" : "live";

  return (
    <main style={{ fontFamily: "ui-sans-serif, system-ui", height: "100vh", width: "100%", minHeight: 0, overflow: "hidden", background: "#f8fafc" }}>
      <section
        style={{
          height: "100%",
          width: "100%",
          minHeight: 0,
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: controller.isRunsPaneVisible ? "320px 1fr" : "1fr",
        }}
      >
        {controller.isRunsPaneVisible ? (
          <WorkflowRunsSidebar model={controller.sidebarModel} formatting={controller.sidebarFormatting} actions={controller.sidebarActions} />
        ) : null}

        <div style={{ height: "100%", minWidth: 0, minHeight: 0, background: "#f8fafc", display: "grid", gridTemplateRows: controller.isPanelCollapsed ? "minmax(0, 1fr) 36px" : `minmax(0, 1fr) ${controller.inspectorHeight}px` }}>
          <div style={{ height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden", background: "#f8fafc", position: "relative" }}>
            {controller.displayedWorkflow ? (
              <WorkflowCanvas
                workflow={controller.displayedWorkflow}
                nodeSnapshotsByNodeId={controller.displayedNodeSnapshotsByNodeId}
                pinnedNodeIds={controller.pinnedNodeIds}
                selectedNodeId={controller.selectedNodeId}
                isLiveWorkflowView={controller.isLiveWorkflowView}
                isRunning={controller.isRunning}
                onSelectNode={controller.selectCanvasNode}
                onRunNode={controller.runCanvasNode}
                onTogglePinnedOutput={controller.toggleCanvasNodePin}
                onEditNodeOutput={controller.editCanvasNodeOutput}
                onClearPinnedOutput={controller.clearCanvasNodePin}
              />
            ) : (
              <div style={{ padding: 16, opacity: 0.8 }}>Loading diagram…</div>
            )}
            <div
              style={{
                position: "absolute",
                top: 12,
                left: "50%",
                transform: "translateX(-50%)",
                zIndex: 6,
                display: "flex",
                alignItems: "center",
                gap: 8,
                pointerEvents: "none",
              }}
            >
              <div style={{ display: "flex", border: "1px solid #cbd5e1", background: "rgba(255,255,255,0.96)", boxShadow: "0 8px 20px rgba(15,23,42,0.08)", pointerEvents: "auto" }}>
                <button
                  data-testid="workflow-canvas-tab-live"
                  onClick={controller.openLiveWorkflow}
                  aria-pressed={activeCanvasTab === "live"}
                  style={{
                    padding: "8px 12px",
                    border: "none",
                    borderRight: "1px solid #cbd5e1",
                    background: activeCanvasTab === "live" ? "#111827" : "transparent",
                    color: activeCanvasTab === "live" ? "#fff" : "#111827",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Live workflow
                </button>
                <button
                  data-testid="workflow-canvas-tab-executions"
                  onClick={controller.openExecutionsPane}
                  aria-pressed={activeCanvasTab === "executions"}
                  style={{
                    padding: "8px 12px",
                    border: "none",
                    background: activeCanvasTab === "executions" ? "#111827" : "transparent",
                    color: activeCanvasTab === "executions" ? "#fff" : "#111827",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                  }}
                >
                  Executions
                </button>
              </div>
              {controller.canCopySelectedRunToLive ? (
                <button
                  data-testid="canvas-copy-to-live-button"
                  onClick={controller.copySelectedRunToLive}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #111827",
                    background: "#111827",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: "pointer",
                    pointerEvents: "auto",
                  }}
                >
                  Copy to live
                </button>
              ) : null}
            </div>
            {controller.isLiveWorkflowView && !controller.isRunsPaneVisible ? (
              <div
                style={{
                  position: "absolute",
                  bottom: 12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  zIndex: 6,
                  pointerEvents: "auto",
                }}
              >
                <button
                  data-testid="canvas-run-workflow-button"
                  onClick={controller.runWorkflowFromCanvas}
                  disabled={controller.isRunning}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #111827",
                    background: "#111827",
                    color: "#fff",
                    fontSize: 12,
                    fontWeight: 800,
                    cursor: controller.isRunning ? "not-allowed" : "pointer",
                    opacity: controller.isRunning ? 0.8 : 1,
                  }}
                >
                  {controller.isRunning ? "Running..." : "Run workflow"}
                </button>
              </div>
            ) : null}
          </div>

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
        </div>
      </section>
      {controller.jsonEditorState ? <WorkflowJsonEditorDialog state={controller.jsonEditorState} onClose={controller.closeJsonEditor} onSave={controller.saveJsonEditor} /> : null}
      <style>{WORKFLOW_DETAIL_TREE_STYLES}</style>
    </main>
  );
}
