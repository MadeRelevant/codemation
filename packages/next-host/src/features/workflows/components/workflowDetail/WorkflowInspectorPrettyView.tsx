import { useEffect,useMemo,useState } from "react";

import { WorkflowInspectorPrettyTreePresenter } from "./WorkflowInspectorPrettyTreePresenter";
import { WorkflowInspectorPrettyTreeViewRenderer } from "./WorkflowInspectorPrettyTreeViewRenderer";

export function WorkflowInspectorPrettyView(args: Readonly<{ value: unknown; emptyLabel: string }>) {
  const { value, emptyLabel } = args;
  const treeData = useMemo(() => WorkflowInspectorPrettyTreePresenter.buildTreeData(value), [value]);
  const allExpandedKeys = useMemo(() => WorkflowInspectorPrettyTreePresenter.collectKeys(treeData), [treeData]);
  const [expandedKeys, setExpandedKeys] = useState<ReadonlyArray<string>>([]);
  const expandedKeySet = useMemo(() => new Set(expandedKeys), [expandedKeys]);

  useEffect(() => {
    setExpandedKeys(allExpandedKeys);
  }, [allExpandedKeys]);

  if (value === undefined) {
    return <div data-testid="workflow-inspector-empty-state" style={{ opacity: 0.62, fontSize: 13 }}>{emptyLabel}</div>;
  }

  return (
    <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          <button onClick={() => setExpandedKeys([])} style={{ border: "1px solid #d1d5db", background: "white", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            Collapse all
          </button>
          <button onClick={() => setExpandedKeys(allExpandedKeys)} style={{ border: "1px solid #d1d5db", background: "white", padding: "6px 10px", cursor: "pointer", fontWeight: 700, fontSize: 12 }}>
            Expand all
          </button>
        </div>
        <div data-testid="workflow-inspector-pretty-hint" style={{ fontSize: 12, opacity: 0.65 }}>
          Readable tree view with preserved line breaks
        </div>
      </div>
      <div style={{ minWidth: 0, overflowX: "hidden", overflowY: "auto", border: "1px solid #d1d5db", background: "#f8fafc", padding: 12 }}>
        <div data-testid="workflow-inspector-pretty-tree">
          {WorkflowInspectorPrettyTreeViewRenderer.renderNodes(treeData, expandedKeySet, (key) => {
            setExpandedKeys((current) => (current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key]));
          })}
        </div>
      </div>
    </div>
  );
}
