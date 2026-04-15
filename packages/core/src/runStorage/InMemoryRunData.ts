import type { Items, MutableRunData, NodeId, NodeIdRef, NodeOutputs, OutputPortKey, Item } from "../types";

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

  getOutputItems<TJson = unknown>(nodeId: NodeId | NodeIdRef<TJson>, output: OutputPortKey = "main"): Items<TJson> {
    return (this.byNode.get(nodeId)?.[output] ?? []) as Items<TJson>;
  }

  getOutputItem<TJson = unknown>(
    nodeId: NodeId | NodeIdRef<TJson>,
    itemIndex: number,
    output: OutputPortKey = "main",
  ): Item<TJson> | undefined {
    return this.getOutputItems<TJson>(nodeId, output)[itemIndex];
  }

  dump(): Record<NodeId, NodeOutputs> {
    const out: Record<NodeId, NodeOutputs> = {};
    for (const [nodeId, outputs] of this.byNode.entries()) out[nodeId] = outputs;
    return out;
  }
}
