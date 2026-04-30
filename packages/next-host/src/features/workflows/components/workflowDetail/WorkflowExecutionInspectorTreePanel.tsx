import { useMemo } from "react";
import { WorkflowExecutionInspectorTreePanelContent } from "./WorkflowExecutionInspectorTreePanelContent";
import { WorkflowExecutionTreeDataLoaderAdapter } from "../../lib/workflowDetail/WorkflowExecutionTreeDataLoaderAdapter";
import type {
  WorkflowExecutionInspectorFormatting,
  WorkflowExecutionInspectorModel,
  WorkflowExecutionInspectorTreeSelection,
} from "../../lib/workflowDetail/workflowDetailTypes";

export function WorkflowExecutionInspectorTreePanel(
  props: Readonly<{
    model: Pick<
      WorkflowExecutionInspectorModel,
      "executionTreeData" | "executionTreeExpandedKeys" | "selectedExecutionTreeKey" | "viewContext"
    >;
    formatting: Pick<WorkflowExecutionInspectorFormatting, "formatDurationLabel" | "getNodeDisplayName">;
    onSelectNode: (selection: WorkflowExecutionInspectorTreeSelection) => void;
  }>,
) {
  const { executionTreeData, executionTreeExpandedKeys, selectedExecutionTreeKey, viewContext } = props.model;
  const { onSelectNode } = props;
  const treeModel = useMemo(
    () => WorkflowExecutionTreeDataLoaderAdapter.create(executionTreeData),
    [executionTreeData],
  );

  return (
    <div
      data-testid="workflow-execution-tree-panel"
      style={{
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
            {viewContext === "live-workflow"
              ? "No workflow nodes available yet."
              : "No node events yet for this execution."}
          </div>
        ) : (
          <WorkflowExecutionInspectorTreePanelContent
            treeModel={treeModel}
            executionTreeExpandedKeys={executionTreeExpandedKeys}
            selectedExecutionTreeKey={selectedExecutionTreeKey}
            viewContext={viewContext}
            formatting={props.formatting}
            onSelectNode={onSelectNode}
          />
        )}
      </div>
    </div>
  );
}
