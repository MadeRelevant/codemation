import Tree from "rc-tree";
import { WorkflowNodeIconResolver, WorkflowStatusIcon } from "./WorkflowDetailIcons";
import type {
  ExecutionTreeNode,
  WorkflowExecutionInspectorFormatting,
  WorkflowExecutionInspectorModel,
} from "../../lib/workflowDetail/workflowDetailTypes";

export function WorkflowExecutionInspectorTreePanel(
  props: Readonly<{
    model: Pick<
      WorkflowExecutionInspectorModel,
      "executionTreeData" | "executionTreeExpandedKeys" | "selectedExecutionTreeKey" | "viewContext"
    >;
    formatting: Pick<WorkflowExecutionInspectorFormatting, "formatDurationLabel" | "getNodeDisplayName">;
    onSelectNode: (nodeId: string) => void;
  }>,
) {
  const { executionTreeData, executionTreeExpandedKeys, selectedExecutionTreeKey, viewContext } = props.model;
  const { formatDurationLabel, getNodeDisplayName } = props.formatting;
  const { onSelectNode } = props;
  return (
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
            {viewContext === "live-workflow"
              ? "No workflow nodes available yet."
              : "No node events yet for this execution."}
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
            selectedKeys={selectedExecutionTreeKey ? [selectedExecutionTreeKey] : []}
            onSelect={(_keys, info) => {
              const workflowNode = (info.node as ExecutionTreeNode).workflowNode;
              onSelectNode(workflowNode?.id ?? String(info.node.key));
            }}
            titleRender={(treeNode) => {
              const isSelected = treeNode.key === selectedExecutionTreeKey;
              const snapshot = treeNode.snapshot;
              const node = treeNode.workflowNode;
              const status = snapshot?.status ?? "pending";
              const durationLabel = formatDurationLabel(snapshot);
              const FallbackIcon = WorkflowNodeIconResolver.resolveFallback(node?.type ?? "", node?.role, node?.icon);
              return (
                <div
                  data-testid={`execution-tree-node-${String(treeNode.key)}`}
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
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        display: "grid",
                        placeItems: "center",
                        color: "#111827",
                        background: "#f8fafc",
                        flex: "0 0 auto",
                      }}
                    >
                      <FallbackIcon size={14} strokeWidth={1.9} />
                    </div>
                    <WorkflowStatusIcon status={status} size={15} />
                    <div
                      style={{
                        minWidth: 0,
                        fontSize: 13,
                        fontWeight: 700,
                        color: "#111827",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
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
  );
}
