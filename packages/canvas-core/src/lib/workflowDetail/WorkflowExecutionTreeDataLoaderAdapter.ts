import type { ExecutionTreeItemData, ExecutionTreeNode } from "./workflowDetailTypes";

export type WorkflowExecutionTreeDataLoaderModel = Readonly<{
  rootItemId: string;
  itemDataById: ReadonlyMap<string, ExecutionTreeItemData>;
  childIdsByParentId: ReadonlyMap<string, ReadonlyArray<string>>;
}>;

export class WorkflowExecutionTreeDataLoaderAdapter {
  private static readonly ROOT_ITEM_ID = "__codemation_execution_tree_root__";

  static createTopologyKey(nodes: ReadonlyArray<ExecutionTreeNode>): string {
    const parts: string[] = [];
    this.collectTopologyKeyParts(nodes, parts);
    return parts.join("|");
  }

  static create(nodes: ReadonlyArray<ExecutionTreeNode>): WorkflowExecutionTreeDataLoaderModel {
    const itemDataById = new Map<string, ExecutionTreeItemData>();
    const childIdsByParentId = new Map<string, ReadonlyArray<string>>();
    const rootChildIds = nodes.map((node) => node.key);

    itemDataById.set(this.ROOT_ITEM_ID, {
      key: this.ROOT_ITEM_ID,
      title: "Execution tree",
      childKeys: rootChildIds,
      inspectorNodeId: this.ROOT_ITEM_ID,
      canvasNodeId: null,
    });
    childIdsByParentId.set(this.ROOT_ITEM_ID, rootChildIds);

    for (const node of nodes) {
      this.registerNode(node, itemDataById, childIdsByParentId);
    }

    return {
      rootItemId: this.ROOT_ITEM_ID,
      itemDataById,
      childIdsByParentId,
    };
  }

  private static registerNode(
    node: ExecutionTreeNode,
    itemDataById: Map<string, ExecutionTreeItemData>,
    childIdsByParentId: Map<string, ReadonlyArray<string>>,
  ): void {
    const childKeys = node.children.map((child) => child.key);
    itemDataById.set(node.key, {
      key: node.key,
      title: node.title,
      workflowNode: node.workflowNode,
      snapshot: node.snapshot,
      childKeys,
      inspectorNodeId: node.inspectorNodeId,
      canvasNodeId: node.canvasNodeId,
    });
    childIdsByParentId.set(node.key, childKeys);
    for (const child of node.children) {
      this.registerNode(child, itemDataById, childIdsByParentId);
    }
  }

  private static collectTopologyKeyParts(nodes: ReadonlyArray<ExecutionTreeNode>, parts: string[]): void {
    for (const node of nodes) {
      parts.push(`${node.key}->${node.children.map((child) => child.key).join(",")}`);
      this.collectTopologyKeyParts(node.children, parts);
    }
  }
}
