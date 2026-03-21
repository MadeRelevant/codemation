import { WorkflowStatusIcon } from "./WorkflowDetailIcons";
import { WorkflowExecutionInspectorPanes } from "./WorkflowExecutionInspectorPanes";
import type { WorkflowExecutionInspectorActions,WorkflowExecutionInspectorFormatting,WorkflowExecutionInspectorModel } from "./workflowDetailTypes";

export function WorkflowExecutionInspectorDetailBody(props: Readonly<{
  model: Pick<
    WorkflowExecutionInspectorModel,
    | "inputPane"
    | "outputPane"
    | "selectedMode"
    | "selectedNodeError"
    | "selectedNodeId"
    | "nodeActions"
    | "selectedNodeSnapshot"
    | "selectedPinnedOutput"
    | "selectedWorkflowNode"
    | "viewContext"
  >;
  formatting: Pick<
    WorkflowExecutionInspectorFormatting,
    "formatDateTime" | "formatDurationLabel" | "getErrorClipboardText" | "getErrorHeadline" | "getErrorStack" | "getNodeDisplayName" | "getSnapshotTimestamp"
  >;
  actions: Pick<
    WorkflowExecutionInspectorActions,
    "onClearPinnedOutput" | "onEditSelectedOutput" | "onSelectFormat" | "onSelectInputPort" | "onSelectMode" | "onSelectOutputPort"
  >;
}>) {
  const { actions, formatting, model } = props;
  const {
    inputPane,
    nodeActions,
    outputPane,
    selectedMode,
    selectedNodeError,
    selectedNodeId,
    selectedNodeSnapshot,
    selectedPinnedOutput,
    selectedWorkflowNode,
    viewContext,
  } = model;
  const { formatDateTime, formatDurationLabel, getErrorClipboardText, getErrorHeadline, getErrorStack, getNodeDisplayName, getSnapshotTimestamp } = formatting;
  const { onClearPinnedOutput, onEditSelectedOutput, onSelectFormat, onSelectInputPort, onSelectMode, onSelectOutputPort } = actions;
  const paneActions = { onClearPinnedOutput, onEditSelectedOutput, onSelectFormat, onSelectInputPort, onSelectOutputPort };
  const errorFormatting = { getErrorClipboardText, getErrorHeadline, getErrorStack };
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

  return (
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

      <WorkflowExecutionInspectorPanes
        panes={panes}
        nodeActions={nodeActions}
        selectedPinnedOutput={selectedPinnedOutput}
        selectedNodeError={selectedNodeError}
        actions={paneActions}
        formatting={errorFormatting}
      />
    </div>
  );
}
