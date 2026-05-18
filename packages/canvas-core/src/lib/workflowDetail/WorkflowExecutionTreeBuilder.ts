import type { ExecutionNode, ExecutionTreeNode } from "./workflowDetailTypes";

type MutableExecutionTreeNode = {
  key: string;
  title?: ExecutionTreeNode["title"];
  workflowNode?: ExecutionTreeNode["workflowNode"];
  snapshot?: ExecutionTreeNode["snapshot"];
  inspectorNodeId: string;
  canvasNodeId: string | null;
  children: MutableExecutionTreeNode[];
  isLeaf: boolean;
};

export class WorkflowExecutionTreeBuilder {
  static build(nodes: ReadonlyArray<ExecutionNode>): ReadonlyArray<ExecutionTreeNode> {
    const treeKeys = this.computeStableKeys(nodes);
    const treeNodesByKey = new Map<string, MutableExecutionTreeNode>();
    const parentReferenceToTreeKey = this.buildParentReferenceRegistry(nodes, treeKeys);
    const rootNodes: MutableExecutionTreeNode[] = [];

    for (let index = 0; index < nodes.length; index += 1) {
      const entry = nodes[index]!;
      const treeKey = treeKeys[index]!;
      treeNodesByKey.set(treeKey, {
        key: treeKey,
        title: entry.node.name ?? entry.node.type ?? entry.node.id,
        workflowNode: entry.node,
        snapshot: entry.snapshot,
        inspectorNodeId: entry.node.id,
        canvasNodeId: entry.workflowNodeId ?? entry.slotNodeId ?? entry.workflowConnectionNodeId ?? entry.node.id,
        children: [],
        isLeaf: true,
      });
    }

    for (let index = 0; index < nodes.length; index += 1) {
      const entry = nodes[index]!;
      const treeKey = treeKeys[index]!;
      const treeNode = treeNodesByKey.get(treeKey);
      if (!treeNode) {
        continue;
      }
      const parentTreeNode = this.resolveParentTreeNode(entry, parentReferenceToTreeKey, treeNodesByKey);
      if (!parentTreeNode) {
        rootNodes.push(treeNode);
        continue;
      }
      const parentChildren = [...parentTreeNode.children, treeNode];
      parentTreeNode.children = parentChildren;
      parentTreeNode.isLeaf = false;
    }

    return rootNodes;
  }

  /**
   * Tries each of the candidate parent references in priority order. The first reference that
   * resolves to a registered tree node wins. We deliberately fall through unresolved candidates
   * (e.g. a `parentInvocationId` set to an agent's runtime activationId that is _not_ a
   * connection-invocation row id) so that a static `node.parentNodeId` can still anchor the
   * branch instead of orphaning the row to root.
   */
  private static resolveParentTreeNode(
    entry: ExecutionNode,
    parentReferenceToTreeKey: ReadonlyMap<string, string>,
    treeNodesByKey: ReadonlyMap<string, MutableExecutionTreeNode>,
  ): MutableExecutionTreeNode | undefined {
    const parentReferences: ReadonlyArray<string | undefined> = [
      entry.parentInvocationId,
      entry.parentExecutionInstanceId,
      entry.snapshot?.parent?.nodeId,
      entry.node.parentNodeId,
    ];
    for (const parentReference of parentReferences) {
      if (!parentReference) continue;
      const parentTreeKey = parentReferenceToTreeKey.get(parentReference) ?? parentReference;
      const parentTreeNode = treeNodesByKey.get(parentTreeKey);
      if (parentTreeNode) return parentTreeNode;
    }
    return undefined;
  }

  static collectBranchKeys(nodes: ReadonlyArray<ExecutionTreeNode>): ReadonlyArray<string> {
    const keys: string[] = [];
    this.collectBranchKeysRecursive(nodes, keys);
    return keys;
  }

  static resolveSelectionKey(
    executionNodes: ReadonlyArray<ExecutionNode>,
    selectedNodeId: string | null,
  ): string | null {
    if (!selectedNodeId) {
      return null;
    }
    const treeKeys = this.computeStableKeys(executionNodes);
    for (let index = executionNodes.length - 1; index >= 0; index -= 1) {
      const entry = executionNodes[index]!;
      if (entry.node.id === selectedNodeId || entry.workflowConnectionNodeId === selectedNodeId) {
        return treeKeys[index]!;
      }
    }
    return selectedNodeId;
  }

  private static collectBranchKeysRecursive(nodes: ReadonlyArray<ExecutionTreeNode>, keys: string[]): void {
    for (const node of nodes) {
      if (node.children.length === 0) {
        continue;
      }
      keys.push(node.key);
      this.collectBranchKeysRecursive(node.children, keys);
    }
  }

  private static buildParentReferenceRegistry(
    nodes: ReadonlyArray<ExecutionNode>,
    treeKeys: ReadonlyArray<string>,
  ): ReadonlyMap<string, string> {
    const registry = new Map<string, string>();
    for (let index = 0; index < nodes.length; index += 1) {
      const treeKey = treeKeys[index]!;
      const entry = nodes[index]!;
      registry.set(entry.node.id, treeKey);
      if (entry.executionInstanceId) {
        registry.set(entry.executionInstanceId, treeKey);
      }
      if (entry.workflowConnectionNodeId) {
        registry.set(entry.workflowConnectionNodeId, treeKey);
      }
    }
    return registry;
  }

  private static computeStableKeys(nodes: ReadonlyArray<ExecutionNode>): ReadonlyArray<string> {
    const keyCounts = new Map<string, number>();
    for (const entry of nodes) {
      keyCounts.set(entry.node.id, (keyCounts.get(entry.node.id) ?? 0) + 1);
    }
    const hasCollision = [...keyCounts.values()].some((count) => count > 1);
    if (!hasCollision) {
      return nodes.map((entry) => entry.node.id);
    }
    const used = new Set<string>();
    const keys: string[] = [];
    for (const entry of nodes) {
      let key = entry.node.id;
      if (used.has(key)) {
        let suffix = 1;
        while (used.has(`${entry.node.id}__${suffix}`)) {
          suffix += 1;
        }
        key = `${entry.node.id}__${suffix}`;
      }
      used.add(key);
      keys.push(key);
    }
    return keys;
  }
}
