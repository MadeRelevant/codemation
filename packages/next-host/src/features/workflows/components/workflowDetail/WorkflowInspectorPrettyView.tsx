import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

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
    return (
      <div data-testid="workflow-inspector-empty-state" className="text-sm text-muted-foreground opacity-80">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_1fr] gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs font-bold"
            onClick={() => setExpandedKeys([])}
          >
            Collapse all
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs font-bold"
            onClick={() => setExpandedKeys(allExpandedKeys)}
          >
            Expand all
          </Button>
        </div>
        <div data-testid="workflow-inspector-pretty-hint" className="text-xs text-muted-foreground">
          Readable tree view with preserved line breaks
        </div>
      </div>
      <div className="min-w-0 overflow-x-hidden overflow-y-auto border border-border bg-muted/40 p-3">
        <div data-testid="workflow-inspector-pretty-tree">
          {WorkflowInspectorPrettyTreeViewRenderer.renderNodes(treeData, expandedKeySet, (key) => {
            setExpandedKeys((current) =>
              current.includes(key) ? current.filter((entry) => entry !== key) : [...current, key],
            );
          })}
        </div>
      </div>
    </div>
  );
}
