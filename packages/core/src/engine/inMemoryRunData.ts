import type { Items, MutableRunData, NodeId, NodeOutputs, OutputPortKey } from "../types";

export class InMemoryRunData implements MutableRunData {
  private readonly byNode = new Map<NodeId, NodeOutputs>();

  constructor(initial?: Record<NodeId, NodeOutputs>) {
    if (initial) {
      for (const [nodeId, outputs] of Object.entries(initial)) this.byNode.set(nodeId, outputs);
    }
  }

  setOutputs(nodeId: NodeId, outputs: NodeOutputs): void {
    this.byNode.set(nodeId, outputs);
  }

  getOutputs(nodeId: NodeId): NodeOutputs | undefined {
    return this.byNode.get(nodeId);
  }

  getOutputItems(nodeId: NodeId, output: OutputPortKey = "main"): Items {
    return this.byNode.get(nodeId)?.[output] ?? [];
  }

  getOutputItem(nodeId: NodeId, itemIndex: number, output: OutputPortKey = "main") {
    return this.getOutputItems(nodeId, output)[itemIndex];
  }

  dump(): Record<NodeId, NodeOutputs> {
    const out: Record<NodeId, NodeOutputs> = {};
    for (const [nodeId, outputs] of this.byNode.entries()) out[nodeId] = outputs;
    return out;
  }
}

