import type { NodeId, OutputPortKey, WorkflowDefinition, WorkflowGraph } from "../types";

export class ExecutableGraph implements WorkflowGraph {
  private readonly outgoingByNodeAndPort = new Map<NodeId, Map<OutputPortKey, NodeId[]>>();

  constructor(def: WorkflowDefinition) {
    for (const e of def.edges) {
      const byPort = this.outgoingByNodeAndPort.get(e.from.nodeId) ?? new Map<OutputPortKey, NodeId[]>();
      const next = byPort.get(e.from.output) ?? [];
      next.push(e.to.nodeId);
      byPort.set(e.from.output, next);
      this.outgoingByNodeAndPort.set(e.from.nodeId, byPort);
    }
  }

  next(nodeId: NodeId, output: OutputPortKey): NodeId[] {
    return this.outgoingByNodeAndPort.get(nodeId)?.get(output) ?? [];
  }
}

