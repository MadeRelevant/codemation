import type { NodeDefinition, NodeId, WorkflowDefinition } from "../../types";

/**
 * Derives which workflow nodes participate in the main execution graph vs connection-only children.
 */
export class WorkflowExecutableNodeClassifier {
  private readonly connectionOwnedIds: ReadonlySet<NodeId>;

  constructor(workflow: WorkflowDefinition) {
    this.connectionOwnedIds = this.collectConnectionOwnedIds(workflow);
  }

  isConnectionOwnedNodeId(nodeId: NodeId): boolean {
    return this.connectionOwnedIds.has(nodeId);
  }

  isExecutableNodeId(nodeId: NodeId): boolean {
    return !this.connectionOwnedIds.has(nodeId);
  }

  filterExecutableNodeDefinitions(nodes: ReadonlyArray<NodeDefinition>): ReadonlyArray<NodeDefinition> {
    return nodes.filter((n) => this.isExecutableNodeId(n.id));
  }

  private collectConnectionOwnedIds(workflow: WorkflowDefinition): ReadonlySet<NodeId> {
    const ids = new Set<NodeId>();
    for (const connection of workflow.connections ?? []) {
      for (const childId of connection.childNodeIds) {
        ids.add(childId);
      }
    }
    return ids;
  }

  /**
   * Resolves the default start node: first trigger, else first executable node with no incoming edges from executable nodes.
   */
  findDefaultExecutableStartNodeId(workflow: WorkflowDefinition): NodeId {
    const firstTrigger = workflow.nodes.find((n) => n.kind === "trigger" && this.isExecutableNodeId(n.id))?.id;
    if (firstTrigger) return firstTrigger;

    const incoming = new Map<NodeId, number>();
    for (const n of workflow.nodes) {
      if (this.isExecutableNodeId(n.id)) incoming.set(n.id, 0);
    }
    for (const e of workflow.edges) {
      if (!this.isExecutableNodeId(e.from.nodeId) || !this.isExecutableNodeId(e.to.nodeId)) continue;
      incoming.set(e.to.nodeId, (incoming.get(e.to.nodeId) ?? 0) + 1);
    }
    const start = workflow.nodes.find((n) => this.isExecutableNodeId(n.id) && (incoming.get(n.id) ?? 0) === 0)?.id;
    return (
      start ??
      workflow.nodes.find((n) => this.isExecutableNodeId(n.id))?.id ??
      (() => {
        throw new Error(`Workflow ${workflow.id} has no executable nodes`);
      })()
    );
  }

  firstExecutableNodeIdInDefinitionOrder(workflow: WorkflowDefinition): NodeId | undefined {
    return workflow.nodes.find((n) => this.isExecutableNodeId(n.id))?.id;
  }

  lastExecutableNodeIdInDefinitionOrder(workflow: WorkflowDefinition): NodeId {
    for (let i = workflow.nodes.length - 1; i >= 0; i--) {
      const n = workflow.nodes[i]!;
      if (this.isExecutableNodeId(n.id)) return n.id;
    }
    throw new Error(`Workflow ${workflow.id} has no executable nodes`);
  }
}
