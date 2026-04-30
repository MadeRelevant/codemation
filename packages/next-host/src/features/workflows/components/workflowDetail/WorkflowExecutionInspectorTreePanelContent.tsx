import { hotkeysCoreFeature, syncDataLoaderFeature } from "@headless-tree/core";
import { useTree } from "@headless-tree/react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

import { Tree, TreeItem } from "@/components/reui/tree";
import { cn } from "@/lib/utils";

import { WorkflowStatusIcon } from "./WorkflowDetailIcons";
import { WorkflowCanvasNodeIcon } from "../canvas/WorkflowCanvasNodeIcon";
import { useExecutionTreeAutoFollow } from "../../hooks/workflowDetail/useExecutionTreeAutoFollow";
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
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Only used to seed the first render; subsequent merges happen below in the merge effect.
  const initialExpandedItemsRef = useRef<string[] | null>(null);
  if (initialExpandedItemsRef.current === null) {
    initialExpandedItemsRef.current = [treeModel.rootItemId, ...executionTreeExpandedKeys];
  }
  const initialExpandedItems = initialExpandedItemsRef.current;
  const [expandedItems, setExpandedItems] = useState<string[]>(initialExpandedItems);
  const knownDefaultExpandedKeysRef = useRef<Set<string>>(new Set(initialExpandedItems));
  // Merge in newly-introduced default-expanded keys (e.g. brand-new tool invocations) without
  // overwriting user collapses. Anything the user has already collapsed stays collapsed; anything
  // new from the data layer becomes expanded by default.
  useEffect(() => {
    const known = knownDefaultExpandedKeysRef.current;
    const newlyIntroduced: string[] = [];
    if (!known.has(treeModel.rootItemId)) {
      newlyIntroduced.push(treeModel.rootItemId);
      known.add(treeModel.rootItemId);
    }
    for (const key of executionTreeExpandedKeys) {
      if (!known.has(key)) {
        newlyIntroduced.push(key);
        known.add(key);
      }
    }
    if (newlyIntroduced.length === 0) {
      return;
    }
    setExpandedItems((current) => {
      const next = new Set(current);
      for (const key of newlyIntroduced) {
        next.add(key);
      }
      return Array.from(next);
    });
  }, [executionTreeExpandedKeys, treeModel.rootItemId]);

  const tree = useTree<ExecutionTreeItemData>({
    rootItemId: treeModel.rootItemId,
    state: { expandedItems },
    setState: (updater) => {
      setExpandedItems((current) => {
        const previousState: Partial<{ expandedItems: string[] }> = { expandedItems: current };
        const nextState = typeof updater === "function" ? updater(previousState) : updater;
        return nextState.expandedItems ?? current;
      });
    },
    setExpandedItems: (updater) => {
      setExpandedItems((current) => (typeof updater === "function" ? updater(current) : updater));
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

  // Topology can change in place (new tool invocations, removed nodes). Force the tree to
  // re-flatten so freshly arrived items are visible without remounting and losing scroll/expansion.
  // The headless tree mutates its internal flat-items list in place when rebuildTree runs, so we
  // bump a local revision to trigger a React re-render and make the new items visible to the JSX
  // below (and any downstream effects that look at the rendered DOM).
  const [, setTreeRevision] = useState(0);
  useLayoutEffect(() => {
    tree.rebuildTree();
    setTreeRevision((rev) => rev + 1);
  }, [tree, treeModel]);

  const setExpandedItemsForFollow = useCallback(
    (updater: (current: string[]) => string[]) => setExpandedItems(updater),
    [],
  );
  const followController = useExecutionTreeAutoFollow({
    treeModel,
    containerRef,
    setExpandedItems: setExpandedItemsForFollow,
    runIdentity: treeModel.rootItemId,
  });

  return (
    <div ref={containerRef}>
      <div className="mb-2 flex items-center justify-end gap-2">
        <button
          type="button"
          data-testid="execution-tree-follow-toggle"
          aria-pressed={followController.isFollowing}
          onClick={followController.toggleFollow}
          className={cn(
            "rounded-sm border px-2 py-0.5 text-[11px] font-semibold transition-colors",
            followController.isFollowing
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/60 bg-background text-muted-foreground hover:bg-accent/40",
          )}
        >
          {followController.isFollowing ? "Following active node" : "Follow active node"}
        </button>
      </div>
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
          // Tree items can briefly point at stale ids during a topology change (the cached flat
          // list is rebuilt from a useEffect). Skip anything the current data loader does not
          // know about so we don't throw inside the render.
          .filter((item) => treeModel.itemDataById.has(item.getId()))
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
                      data-codemation-status={status}
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
    </div>
  );
}
