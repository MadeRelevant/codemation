import { useEffect, useRef, useState } from "react";
import { WorkflowExecutionInspectorDetailBody } from "./WorkflowExecutionInspectorDetailBody";
import { WorkflowExecutionInspectorSidebarResizer } from "./WorkflowExecutionInspectorSidebarResizer";
import { WorkflowExecutionInspectorTreePanel } from "./WorkflowExecutionInspectorTreePanel";
import type {
  WorkflowExecutionInspectorActions,
  WorkflowExecutionInspectorFormatting,
  WorkflowExecutionInspectorModel,
} from "../../lib/workflowDetail/workflowDetailTypes";

export function WorkflowExecutionInspector(
  args: Readonly<{
    model: WorkflowExecutionInspectorModel;
    actions: WorkflowExecutionInspectorActions;
    formatting: WorkflowExecutionInspectorFormatting;
  }>,
) {
  const { actions, formatting, model } = args;
  const {
    executionTreeData,
    executionTreeExpandedKeys,
    selectedExecutionTreeKey,
    isLoading,
    loadError,
    selectedNodeId,
    selectedRun,
    selectedRunDetail,
    selectedWorkflowNode,
    viewContext,
  } = model;
  const { onSelectNode } = actions;
  const TREE_PANEL_MIN_WIDTH_PX = 220;
  const TREE_PANEL_DEFAULT_WIDTH_PX = 320;
  const DETAIL_PANEL_MIN_WIDTH_PX = 320;
  const TREE_RESIZE_HANDLE_WIDTH_PX = 8;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeStartXRef = useRef<number | null>(null);
  const resizeStartWidthRef = useRef(TREE_PANEL_DEFAULT_WIDTH_PX);
  const [treePanelWidth, setTreePanelWidth] = useState(TREE_PANEL_DEFAULT_WIDTH_PX);
  const [isTreePanelResizing, setIsTreePanelResizing] = useState(false);

  useEffect(() => {
    if (!isTreePanelResizing) return;
    const handleMouseMove = (event: MouseEvent) => {
      if (resizeStartXRef.current === null) return;
      const inspectorWidth = containerRef.current?.clientWidth ?? 0;
      const maxTreePanelWidth = Math.max(
        TREE_PANEL_MIN_WIDTH_PX,
        inspectorWidth - DETAIL_PANEL_MIN_WIDTH_PX - TREE_RESIZE_HANDLE_WIDTH_PX,
      );
      const nextWidth = resizeStartWidthRef.current + (event.clientX - resizeStartXRef.current);
      setTreePanelWidth(Math.max(TREE_PANEL_MIN_WIDTH_PX, Math.min(maxTreePanelWidth, nextWidth)));
    };
    const handleMouseUp = () => {
      setIsTreePanelResizing(false);
      resizeStartXRef.current = null;
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isTreePanelResizing]);

  if (isLoading && viewContext === "historical-run" && !selectedRun && !selectedRunDetail)
    return <div style={{ opacity: 0.7 }}>Loading execution details…</div>;
  if (isLoading && viewContext === "live-workflow" && !selectedWorkflowNode)
    return <div style={{ opacity: 0.7 }}>Loading live workflow state…</div>;
  if (loadError) return <div style={{ color: "#b91c1c" }}>{loadError}</div>;
  if (!selectedNodeId) return <div style={{ opacity: 0.7 }}>Select a node to inspect.</div>;

  return (
    <div
      data-testid="workflow-execution-inspector"
      ref={containerRef}
      style={{
        display: "grid",
        gridTemplateColumns: `${treePanelWidth}px ${TREE_RESIZE_HANDLE_WIDTH_PX}px minmax(0, 1fr)`,
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <WorkflowExecutionInspectorTreePanel
        model={{
          executionTreeData,
          executionTreeExpandedKeys,
          selectedExecutionTreeKey,
          viewContext,
        }}
        formatting={{
          formatDurationLabel: formatting.formatDurationLabel,
          getNodeDisplayName: formatting.getNodeDisplayName,
        }}
        onSelectNode={onSelectNode}
      />
      <WorkflowExecutionInspectorSidebarResizer
        widthPx={treePanelWidth}
        isResizing={isTreePanelResizing}
        onResizeStart={(clientX, currentWidth) => {
          resizeStartXRef.current = clientX;
          resizeStartWidthRef.current = currentWidth;
          setIsTreePanelResizing(true);
        }}
      />
      <WorkflowExecutionInspectorDetailBody model={model} actions={actions} formatting={formatting} />
    </div>
  );
}
