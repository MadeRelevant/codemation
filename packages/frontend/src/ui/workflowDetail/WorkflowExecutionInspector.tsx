import { Pencil } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Tree from "rc-tree";
import { WorkflowNodeIconResolver, WorkflowStatusIcon } from "./WorkflowDetailIcons";
import { WorkflowInspectorBinaryView, WorkflowInspectorErrorView, WorkflowInspectorJsonView, WorkflowInspectorPrettyView } from "./WorkflowInspectorViews";
import type { ExecutionTreeNode, WorkflowExecutionInspectorActions, WorkflowExecutionInspectorFormatting, WorkflowExecutionInspectorModel } from "./workflowDetailTypes";

export function WorkflowExecutionInspector(args: Readonly<{
  model: WorkflowExecutionInspectorModel;
  actions: WorkflowExecutionInspectorActions;
  formatting: WorkflowExecutionInspectorFormatting;
}>) {
  const { actions, formatting, model } = args;
  const {
    executionTreeData,
    executionTreeExpandedKeys,
    isLoading,
    loadError,
    inputPane,
    outputPane,
    selectedMode,
    selectedNodeError,
    selectedNodeId,
    nodeActions,
    selectedNodeSnapshot,
    selectedPinnedOutput,
    selectedRun,
    selectedWorkflowNode,
    viewContext,
  } = model;
  const { formatDateTime, formatDurationLabel, getErrorClipboardText, getErrorHeadline, getErrorStack, getNodeDisplayName, getSnapshotTimestamp } = formatting;
  const { onClearPinnedOutput, onEditSelectedOutput, onSelectFormat, onSelectInputPort, onSelectMode, onSelectNode, onSelectOutputPort } = actions;
  const TREE_PANEL_MIN_WIDTH_PX = 220;
  const TREE_PANEL_DEFAULT_WIDTH_PX = 320;
  const DETAIL_PANEL_MIN_WIDTH_PX = 320;
  const TREE_RESIZE_HANDLE_WIDTH_PX = 8;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeStartXRef = useRef<number | null>(null);
  const resizeStartWidthRef = useRef(TREE_PANEL_DEFAULT_WIDTH_PX);
  const [treePanelWidth, setTreePanelWidth] = useState(TREE_PANEL_DEFAULT_WIDTH_PX);
  const [isTreePanelResizing, setIsTreePanelResizing] = useState(false);
  const isInputVisible = selectedMode === "input" || selectedMode === "split";
  const isOutputVisible = selectedMode === "output" || selectedMode === "split";
  const panes = isInputVisible && isOutputVisible ? [inputPane, outputPane] : [isInputVisible ? inputPane : outputPane];
  const selectedNodeDurationLabel = formatDurationLabel(selectedNodeSnapshot);

  const toggleInspectorPane = (tab: "input" | "output") => {
    if (tab === "input") {
      onSelectMode(isInputVisible ? "output" : isOutputVisible ? "split" : "input");
      return;
    }
    onSelectMode(isOutputVisible ? "input" : isInputVisible ? "split" : "output");
  };

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


  if (isLoading && viewContext === "historical-run" && !selectedRun) return <div style={{ opacity: 0.7 }}>Loading execution details…</div>;
  if (isLoading && viewContext === "live-workflow" && !selectedWorkflowNode) return <div style={{ opacity: 0.7 }}>Loading live workflow state…</div>;
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
      <div
        data-testid="workflow-execution-tree-panel"
        style={{
          borderRight: "1px solid #d1d5db",
          minWidth: 0,
          overflowX: "hidden",
          overflowY: "auto",
          padding: 12,
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.45, opacity: 0.64, textTransform: "uppercase" }}>
          {viewContext === "live-workflow" ? "Workflow nodes" : "Execution tree"}
        </div>
        <div style={{ marginTop: 10 }}>
          {executionTreeData.length === 0 ? (
            <div style={{ fontSize: 12, opacity: 0.7 }}>
              {viewContext === "live-workflow" ? "No workflow nodes available yet." : "No node events yet for this execution."}
            </div>
          ) : (
            <Tree<ExecutionTreeNode>
              className="codemation-execution-tree"
              treeData={executionTreeData as ExecutionTreeNode[]}
              showLine
              showIcon={false}
              defaultExpandAll
              expandedKeys={[...executionTreeExpandedKeys]}
              selectable
              selectedKeys={selectedNodeId ? [selectedNodeId] : []}
              onSelect={(_keys, info) => {
                onSelectNode(String(info.node.key));
              }}
              titleRender={(treeNode) => {
                const isSelected = treeNode.key === selectedNodeId;
                const snapshot = treeNode.snapshot;
                const node = treeNode.workflowNode;
                const status = snapshot?.status ?? "pending";
                const durationLabel = formatDurationLabel(snapshot);
                const FallbackIcon = WorkflowNodeIconResolver.resolveFallback(node?.type ?? "", node?.role, node?.icon);
                return (
                  <div
                    data-testid={`execution-tree-node-${String(treeNode.key)}`}
                    onClick={() => {
                      onSelectNode(String(treeNode.key));
                    }}
                    style={{
                      background: isSelected ? "#eff6ff" : "transparent",
                      padding: "6px 10px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 10,
                      minWidth: 0,
                      boxShadow: isSelected ? "inset 2px 0 0 #2563eb" : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0, flex: "1 1 auto" }}>
                      <div style={{ width: 20, height: 20, display: "grid", placeItems: "center", color: "#111827", background: "#f8fafc", flex: "0 0 auto" }}>
                        <FallbackIcon size={14} strokeWidth={1.9} />
                      </div>
                      <WorkflowStatusIcon status={status} size={15} />
                      <div style={{ minWidth: 0, fontSize: 13, fontWeight: 700, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {getNodeDisplayName(node, snapshot?.nodeId ?? null)}
                      </div>
                    </div>
                    {durationLabel ? (
                      <div
                        data-testid={`execution-tree-node-duration-${String(treeNode.key)}`}
                        style={{
                          flex: "0 0 auto",
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#6b7280",
                          whiteSpace: "nowrap",
                          textAlign: "right",
                        }}
                      >
                        {durationLabel}
                      </div>
                    ) : null}
                  </div>
                );
              }}
            />
          )}
        </div>
      </div>

      <div
        data-testid="workflow-execution-tree-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize execution tree"
        onMouseDown={(event) => {
          event.preventDefault();
          resizeStartXRef.current = event.clientX;
          resizeStartWidthRef.current = treePanelWidth;
          setIsTreePanelResizing(true);
        }}
        style={{
          position: "relative",
          zIndex: 10,
          width: TREE_RESIZE_HANDLE_WIDTH_PX,
          cursor: "col-resize",
          background: isTreePanelResizing ? "#bfdbfe" : "#e5e7eb",
          borderLeft: "1px solid #d1d5db",
          borderRight: "1px solid #d1d5db",
        }}
      />

      <div style={{ display: "grid", gridTemplateRows: "auto 1fr", minWidth: 0, minHeight: 0, overflow: "hidden" }}>
        <div style={{ display: "grid", gap: 8, padding: "10px 12px", borderBottom: "1px solid #d1d5db" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <WorkflowStatusIcon status={selectedNodeSnapshot?.status ?? "pending"} />
                <div data-testid="selected-node-name" style={{ fontWeight: 800, fontSize: 14, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {getNodeDisplayName(selectedWorkflowNode, selectedNodeId)}
                </div>
                {selectedPinnedOutput ? (
                  <span data-testid="selected-node-pinned-badge" style={{ border: "1px solid #c4b5fd", background: "#f5f3ff", color: "#6d28d9", fontSize: 11, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", padding: "2px 6px" }}>
                    Pinned
                  </span>
                ) : null}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, color: "#6b7280" }}>
                {selectedNodeSnapshot ? (
                  <>
                    <span>{formatDateTime(getSnapshotTimestamp(selectedNodeSnapshot))}</span>
                    {selectedNodeDurationLabel ? (
                      <span data-testid="selected-node-duration">{` · ${selectedNodeDurationLabel}`}</span>
                    ) : null}
                  </>
                ) : viewContext === "live-workflow" ? "Live workflow node" : "No execution snapshot yet"}
              </div>
            </div>
            <div style={{ display: "flex", minWidth: 0, flexWrap: "wrap", justifyContent: "flex-end", gap: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                {([
                  { tab: "input" as const, isSelected: isInputVisible, hasError: false },
                  { tab: "output" as const, isSelected: isOutputVisible, hasError: Boolean(selectedNodeError) },
                ]).map(({ tab, isSelected, hasError }) => (
                  <button
                    key={tab}
                    type="button"
                    role="checkbox"
                    data-testid={`inspector-tab-${tab}`}
                    onClick={() => toggleInspectorPane(tab)}
                    aria-checked={isSelected}
                    style={{
                      border: isSelected ? "1px solid #111827" : "1px solid #d1d5db",
                      background: isSelected ? "#111827" : "white",
                      color: isSelected ? "white" : hasError ? "#991b1b" : "#111827",
                      padding: "7px 11px",
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span>{tab[0]!.toUpperCase()}{tab.slice(1)}</span>
                      {hasError ? (
                        <span
                          style={{
                            border: isSelected ? "1px solid rgba(255,255,255,0.28)" : "1px solid #fecaca",
                            background: isSelected ? "rgba(255,255,255,0.16)" : "#fef2f2",
                            color: isSelected ? "#ffffff" : "#991b1b",
                            fontSize: 10,
                            fontWeight: 800,
                            letterSpacing: 0.3,
                            textTransform: "uppercase",
                            padding: "1px 5px",
                          }}
                        >
                          Error
                        </span>
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: panes.length === 2 ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
            minHeight: 0,
          }}
        >
          {panes.map((pane, index) => {
            const isOutputPane = pane.tab === "output";
            const availableFormats = pane.attachments.length > 0 ? (["json", "pretty", "binary"] as const) : (["json", "pretty"] as const);
            return (
              <section
                key={pane.tab}
                data-testid={`workflow-inspector-pane-${pane.tab}`}
                style={{
                  display: "grid",
                  gridTemplateRows: "auto auto 1fr",
                  minWidth: 0,
                  minHeight: 0,
                  borderLeft: index > 0 ? "1px solid #e5e7eb" : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 12,
                    padding: "10px 12px",
                    borderBottom: "1px solid #e5e7eb",
                    background: "#f8fafc",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", opacity: 0.72 }}>
                      {pane.tab}
                    </div>
                    {isOutputPane && nodeActions.viewContext === "live-workflow" ? (
                      <button
                        type="button"
                        data-testid="edit-output-button"
                        onClick={onEditSelectedOutput}
                        disabled={!nodeActions.canEditOutput}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          border: "1px solid #d1d5db",
                          background: "white",
                          color: "#111827",
                          padding: "5px 8px",
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: !nodeActions.canEditOutput ? "not-allowed" : "pointer",
                          opacity: !nodeActions.canEditOutput ? 0.6 : 1,
                        }}
                      >
                        <Pencil size={12} strokeWidth={2} />
                        Edit
                      </button>
                    ) : null}
                    {isOutputPane && nodeActions.viewContext === "live-workflow" && selectedPinnedOutput ? (
                      <button
                        type="button"
                        onClick={onClearPinnedOutput}
                        disabled={!nodeActions.canClearPinnedOutput}
                        style={{
                          border: "1px solid #d1d5db",
                          background: "white",
                          color: "#111827",
                          padding: "5px 8px",
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: !nodeActions.canClearPinnedOutput ? "not-allowed" : "pointer",
                          opacity: !nodeActions.canClearPinnedOutput ? 0.6 : 1,
                        }}
                      >
                        Clear pin
                      </button>
                    ) : null}
                    {isOutputPane && pane.showsError ? (
                      <span style={{ border: "1px solid #fecaca", background: "#fef2f2", color: "#991b1b", fontSize: 10, fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", padding: "1px 5px" }}>
                        Error
                      </span>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {availableFormats.map((format) => (
                      <button
                        key={format}
                        data-testid={`inspector-format-${pane.tab}-${format}`}
                        onClick={() => onSelectFormat(pane.tab, format)}
                        aria-pressed={pane.format === format}
                        style={{
                          border: pane.format === format ? "1px solid #111827" : "1px solid #d1d5db",
                          background: pane.format === format ? "#111827" : "white",
                          color: pane.format === format ? "white" : "#111827",
                          padding: "6px 10px",
                          fontWeight: 700,
                          fontSize: 12,
                          cursor: "pointer",
                        }}
                      >
                        {format[0]!.toUpperCase()}
                        {format.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>

                {pane.portEntries.length > 1 ? (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: "10px 12px", borderBottom: "1px solid #e5e7eb", background: "#ffffff", overflowX: "hidden", overflowY: "auto" }}>
                    {pane.portEntries.map(([portName]) => {
                      const isSelected = pane.selectedPort === portName;
                      return (
                        <button
                          key={portName}
                          data-testid={`inspector-port-${pane.tab}-${portName}`}
                          onClick={() => {
                            if (pane.tab === "input") onSelectInputPort(portName);
                            if (pane.tab === "output") onSelectOutputPort(portName);
                          }}
                          style={{ whiteSpace: "nowrap", border: isSelected ? "1px solid #111827" : "1px solid #d1d5db", background: isSelected ? "#111827" : "white", color: isSelected ? "white" : "#111827", padding: "6px 10px", fontWeight: 700, fontSize: 12, cursor: "pointer" }}
                        >
                          {portName}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ borderBottom: "1px solid #e5e7eb" }} />
                )}

                <div style={{ minWidth: 0, overflowX: "hidden", overflowY: "auto", padding: 12 }}>
                  {pane.showsError ? (
                    pane.format === "pretty" ? (
                      <WorkflowInspectorErrorView
                        error={selectedNodeError}
                        emptyLabel={pane.emptyLabel}
                        getErrorClipboardText={getErrorClipboardText}
                        getErrorHeadline={getErrorHeadline}
                        getErrorStack={getErrorStack}
                      />
                    ) : (
                      <WorkflowInspectorJsonView value={selectedNodeError} emptyLabel={pane.emptyLabel} />
                    )
                  ) : pane.format === "binary" ? (
                    <WorkflowInspectorBinaryView attachments={pane.attachments} emptyLabel="No binary attachments captured yet." />
                  ) : pane.format === "pretty" ? (
                    <WorkflowInspectorPrettyView value={pane.value} emptyLabel={pane.emptyLabel} />
                  ) : (
                    <WorkflowInspectorJsonView value={pane.value} emptyLabel={pane.emptyLabel} />
                  )}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
