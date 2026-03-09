import type { InputPortKey, NodeId, OutputPortKey, WorkflowDefinition, WorkflowGraph } from "../types";

export class ExecutableGraph implements WorkflowGraph {
  private readonly outgoingByNodeAndPort = new Map<NodeId, Map<OutputPortKey, Array<Readonly<{ nodeId: NodeId; input: InputPortKey }>>>>();

  constructor(def: WorkflowDefinition) {
    for (const e of def.edges) {
      const byPort =
        this.outgoingByNodeAndPort.get(e.from.nodeId) ?? new Map<OutputPortKey, Array<Readonly<{ nodeId: NodeId; input: InputPortKey }>>>();
      const next = byPort.get(e.from.output) ?? [];
      next.push({ nodeId: e.to.nodeId, input: e.to.input });
      byPort.set(e.from.output, next);
      this.outgoingByNodeAndPort.set(e.from.nodeId, byPort);
    }
  }

  next(nodeId: NodeId, output: OutputPortKey): Array<Readonly<{ nodeId: NodeId; input: InputPortKey }>> {
    return this.outgoingByNodeAndPort.get(nodeId)?.get(output) ?? [];
  }
}

