import { Pencil } from "lucide-react";
import {
  WorkflowInspectorBinaryView,
  WorkflowInspectorErrorView,
  WorkflowInspectorJsonView,
  WorkflowInspectorPrettyView,
} from "./WorkflowInspectorViews";
import type {
  WorkflowExecutionInspectorActions,
  WorkflowExecutionInspectorFormatting,
  WorkflowExecutionInspectorModel,
  WorkflowExecutionInspectorPaneModel,
} from "../../lib/workflowDetail/workflowDetailTypes";

export function WorkflowExecutionInspectorPanes(
  props: Readonly<{
    panes: ReadonlyArray<WorkflowExecutionInspectorPaneModel>;
    nodeActions: WorkflowExecutionInspectorModel["nodeActions"];
    selectedPinnedOutput: WorkflowExecutionInspectorModel["selectedPinnedOutput"];
    selectedNodeError: WorkflowExecutionInspectorModel["selectedNodeError"];
    actions: Pick<
      WorkflowExecutionInspectorActions,
      "onClearPinnedOutput" | "onEditSelectedOutput" | "onSelectFormat" | "onSelectInputPort" | "onSelectOutputPort"
    >;
    formatting: Pick<
      WorkflowExecutionInspectorFormatting,
      "getErrorClipboardText" | "getErrorHeadline" | "getErrorStack"
    >;
  }>,
) {
  const { actions, formatting, nodeActions, panes, selectedNodeError, selectedPinnedOutput } = props;
  const { onClearPinnedOutput, onEditSelectedOutput, onSelectFormat, onSelectInputPort, onSelectOutputPort } = actions;
  const { getErrorClipboardText, getErrorHeadline, getErrorStack } = formatting;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: panes.length === 2 ? "minmax(0, 1fr) minmax(0, 1fr)" : "minmax(0, 1fr)",
        minHeight: 0,
      }}
    >
      {panes.map((pane, index) => {
        const isOutputPane = pane.tab === "output";
        const availableFormats =
          pane.attachments.length > 0 ? (["json", "pretty", "binary"] as const) : (["json", "pretty"] as const);
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
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 800,
                    letterSpacing: 0.45,
                    textTransform: "uppercase",
                    opacity: 0.72,
                  }}
                >
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
                  <span
                    style={{
                      border: "1px solid #fecaca",
                      background: "#fef2f2",
                      color: "#991b1b",
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
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 8,
                  padding: "10px 12px",
                  borderBottom: "1px solid #e5e7eb",
                  background: "#ffffff",
                  overflowX: "hidden",
                  overflowY: "auto",
                }}
              >
                {pane.portEntries.map(([portName, items]) => {
                  const isSelected = pane.selectedPort === portName;
                  return (
                    <button
                      key={portName}
                      data-testid={`inspector-port-${pane.tab}-${portName}`}
                      onClick={() => {
                        if (pane.tab === "input") onSelectInputPort(portName);
                        if (pane.tab === "output") onSelectOutputPort(portName);
                      }}
                      style={{
                        whiteSpace: "nowrap",
                        border: isSelected ? "1px solid #111827" : "1px solid #d1d5db",
                        background: isSelected ? "#111827" : "white",
                        color: isSelected ? "white" : "#111827",
                        padding: "6px 10px",
                        fontWeight: 700,
                        fontSize: 12,
                        cursor: "pointer",
                      }}
                    >
                      {`${portName} (${items.length})`}
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
                <WorkflowInspectorBinaryView
                  attachments={pane.attachments}
                  emptyLabel="No binary attachments captured yet."
                />
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
  );
}
