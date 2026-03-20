import { WorkflowCanvas } from "../components/WorkflowCanvas";
import type { WorkflowDto } from "../realtime/realtime";
import { NodePropertiesSlidePanel } from "../workflowDetail/NodePropertiesSlidePanel";
import { useWorkflowDetailController } from "../workflowDetail/useWorkflowDetailController";
import { WorkflowJsonEditorDialog } from "../workflowDetail/WorkflowJsonEditorDialog";
import { WorkflowRunsSidebar } from "../workflowDetail/WorkflowRunsSidebar";
import { WORKFLOW_DETAIL_TREE_STYLES } from "./workflowDetailTreeStyles";
import { WorkflowDetailScreenInspectorPanel } from "./WorkflowDetailScreenInspectorPanel";

export function WorkflowDetailScreen(args: Readonly<{ workflowId: string; initialWorkflow?: WorkflowDto }>) {
  const controller = useWorkflowDetailController(args);
  const activeCanvasTab = controller.isRunsPaneVisible ? "executions" : "live";
  const shouldShowRealtimeBadge = controller.isLiveWorkflowView && !controller.isRunsPaneVisible;
  const realtimeBadge =
    controller.workflowDevBuildState.state === "failed"
      ? {
          background: "#fee2e2",
          border: "#fecaca",
          color: "#991b1b",
          label: "Rebuild failed. Latest code is not live yet.",
          testId: "workflow-dev-build-failed-indicator",
        }
      : !controller.isRealtimeConnected
        ? {
            background: "#fef3c7",
            border: "#fde68a",
            color: "#92400e",
            label: "Realtime disconnected. Workflow edits won't auto-refresh.",
            testId: "workflow-realtime-disconnected-indicator",
          }
        : controller.workflowDevBuildState.state === "building"
          ? {
              background: "#dbeafe",
              border: "#bfdbfe",
              color: "#1d4ed8",
              label: "Rebuilding workflow...",
              testId: "workflow-dev-build-started-indicator",
            }
          : null;

  return (
    <main style={{ height: "100%", width: "100%", minHeight: 0, overflow: "hidden", background: "#f8fafc" }}>
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
          <div style={{ height: "100%", minWidth: 0, minHeight: 0, overflow: "hidden", background: "#f8fafc", position: "relative", display: "flex", flexDirection: "row" }}>
            {controller.displayedWorkflow ? (
              <>
                <div style={{ flex: 1, minWidth: 0, minHeight: 0, overflow: "hidden", position: "relative" }}>
                  <WorkflowCanvas
                    workflow={controller.displayedWorkflow}
                    nodeSnapshotsByNodeId={controller.displayedNodeSnapshotsByNodeId}
                    pinnedNodeIds={controller.pinnedNodeIds}
                    selectedNodeId={controller.selectedNodeId}
                    propertiesTargetNodeId={controller.propertiesPanelNodeId}
                    isLiveWorkflowView={controller.isLiveWorkflowView}
                    isRunning={controller.isRunning}
                    onSelectNode={controller.selectCanvasNode}
                    onOpenPropertiesNode={controller.openPropertiesPanelForNode}
                    onRunNode={controller.runCanvasNode}
                    onTogglePinnedOutput={controller.toggleCanvasNodePin}
                    onEditNodeOutput={controller.editCanvasNodeOutput}
                    onClearPinnedOutput={controller.clearCanvasNodePin}
                  />
                </div>
                <NodePropertiesSlidePanel
                  workflowId={args.workflowId}
                  isOpen={controller.isPropertiesPanelOpen}
                  node={controller.selectedPropertiesWorkflowNode}
                  onClose={controller.closePropertiesPanel}
                />
              </>
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
            {shouldShowRealtimeBadge && realtimeBadge ? (
              <div
                data-testid={realtimeBadge.testId}
                style={{
                  position: "absolute",
                  top: 12,
                  right: 12,
                  zIndex: 6,
                  padding: "8px 10px",
                  border: `1px solid ${realtimeBadge.border}`,
                  background: realtimeBadge.background,
                  color: realtimeBadge.color,
                  fontSize: 12,
                  fontWeight: 700,
                  boxShadow: "0 8px 20px rgba(15,23,42,0.08)",
                }}
              >
                {realtimeBadge.label}
              </div>
            ) : null}
          </div>

          <WorkflowDetailScreenInspectorPanel controller={controller} />
        </div>
      </section>
      {controller.jsonEditorState ? <WorkflowJsonEditorDialog state={controller.jsonEditorState} onClose={controller.closeJsonEditor} onSave={controller.saveJsonEditor} /> : null}
      <style>{WORKFLOW_DETAIL_TREE_STYLES}</style>
    </main>
  );
}
