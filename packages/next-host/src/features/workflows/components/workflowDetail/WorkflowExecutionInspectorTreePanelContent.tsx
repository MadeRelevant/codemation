import { hotkeysCoreFeature, syncDataLoaderFeature } from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { ChevronDown, ChevronRight } from "lucide-react";

import { Tree, TreeItem } from "@/components/reui/tree";
import { cn } from "@/lib/utils";

import { WorkflowStatusIcon } from "./WorkflowDetailIcons";
import { WorkflowCanvasNodeIcon } from "../canvas/WorkflowCanvasNodeIcon";
import type { WorkflowExecutionTreeDataLoaderModel } from "../../lib/workflowDetail/WorkflowExecutionTreeDataLoaderAdapter";
import type {
  ExecutionTreeItemData,
  WorkflowExecutionInspectorFormatting,
  WorkflowExecutionInspectorModel,
  WorkflowExecutionInspectorTreeSelection,
} from "../../lib/workflowDetail/workflowDetailTypes";

export function WorkflowExecutionInspectorTreePanelContent(
  props: Readonly<{
    treeModel: WorkflowExecutionTreeDataLoaderModel;
    executionTreeExpandedKeys: ReadonlyArray<string>;
    selectedExecutionTreeKey: string | null;
    viewContext: WorkflowExecutionInspectorModel["viewContext"];
    formatting: Pick<WorkflowExecutionInspectorFormatting, "formatDurationLabel" | "getNodeDisplayName">;
    onSelectNode: (selection: WorkflowExecutionInspectorTreeSelection) => void;
  }>,
) {
  const { treeModel, executionTreeExpandedKeys, selectedExecutionTreeKey, viewContext, formatting, onSelectNode } =
    props;
  const { formatDurationLabel, getNodeDisplayName } = formatting;
  const tree = useTree<ExecutionTreeItemData>({
    rootItemId: treeModel.rootItemId,
    initialState: {
      expandedItems: [treeModel.rootItemId, ...executionTreeExpandedKeys],
    },
    dataLoader: {
      getItem: (itemId) => {
        const item = treeModel.itemDataById.get(itemId);
        if (!item) {
          throw new Error(`Execution tree item not found: ${itemId}`);
        }
        return item;
      },
      getChildren: (itemId) => [...(treeModel.childIdsByParentId.get(itemId) ?? [])],
    },
    getItemName: (item) => {
      const itemData = item.getItemData();
      return getNodeDisplayName(itemData.workflowNode, itemData.snapshot?.nodeId ?? null);
    },
    isItemFolder: (item) => item.getItemData().childKeys.length > 0,
    onPrimaryAction: (item) => {
      const itemData = item.getItemData();
      if (itemData.key === treeModel.rootItemId) {
        return;
      }
      onSelectNode({
        inspectorNodeId: itemData.inspectorNodeId,
        canvasNodeId: itemData.canvasNodeId,
      });
    },
    features: [syncDataLoaderFeature, hotkeysCoreFeature],
  });

  return (
    <Tree
      tree={tree}
      indent={14}
      className="codemation-execution-tree gap-0.5"
      toggleIconType="chevron"
      aria-label={viewContext === "live-workflow" ? "Workflow nodes" : "Execution tree"}
    >
      {tree
        .getItems()
        .filter((item) => item.getId() !== treeModel.rootItemId)
        .map((item) => {
          const itemData = item.getItemData();
          const snapshot = itemData.snapshot;
          const node = itemData.workflowNode;
          const status = snapshot?.status ?? "pending";
          const durationLabel = formatDurationLabel(snapshot);
          const isSelected = item.getId() === selectedExecutionTreeKey;
          return (
            <TreeItem<ExecutionTreeItemData> key={item.getId()} item={item} asChild>
              <div className="min-w-0">
                <div className="flex min-w-0 items-start gap-1.5">
                  {item.isFolder() ? (
                    <button
                      type="button"
                      data-testid={`execution-tree-toggle-${itemData.key}`}
                      aria-label={
                        item.isExpanded()
                          ? `Collapse ${getNodeDisplayName(node, snapshot?.nodeId ?? null)}`
                          : `Expand ${getNodeDisplayName(node, snapshot?.nodeId ?? null)}`
                      }
                      aria-expanded={item.isExpanded()}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (item.isExpanded()) {
                          item.collapse();
                          return;
                        }
                        item.expand();
                      }}
                      className="mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
                    >
                      {item.isExpanded() ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </button>
                  ) : (
                    <span className="mt-0.5 block size-4 shrink-0" aria-hidden="true" />
                  )}
                  <div
                    data-testid={`execution-tree-node-${itemData.key}`}
                    className={cn(
                      "min-w-0 flex-1 rounded-sm px-2 py-1 transition-colors",
                      isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/40",
                    )}
                  >
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <div className="flex size-5 shrink-0 items-center justify-center rounded-sm text-foreground/90">
                          <WorkflowCanvasNodeIcon
                            icon={node?.icon}
                            sizePx={13}
                            strokeWidth={1.9}
                            fallbackType={node?.type}
                            fallbackRole={node?.role}
                          />
                        </div>
                        <WorkflowStatusIcon status={status} size={14} />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold leading-5 text-foreground">
                            {getNodeDisplayName(node, snapshot?.nodeId ?? null)}
                          </div>
                          <div className="truncate text-[11px] leading-4 text-muted-foreground">
                            {node?.type ?? node?.id ?? itemData.key}
                          </div>
                        </div>
                      </div>
                      {durationLabel ? (
                        <div
                          data-testid={`execution-tree-node-duration-${itemData.key}`}
                          className="shrink-0 text-[11px] font-semibold leading-4 text-muted-foreground"
                        >
                          {durationLabel}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </TreeItem>
          );
        })}
    </Tree>
  );
}
