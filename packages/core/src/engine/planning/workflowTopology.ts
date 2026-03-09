import type { InputPortKey, NodeId, OutputPortKey, WorkflowDefinition } from "../../types";

type NodeDef = WorkflowDefinition["nodes"][number];

export class WorkflowTopology {
  private constructor(
    public readonly defsById: ReadonlyMap<NodeId, NodeDef>,
    public readonly outgoingByNode: ReadonlyMap<
      NodeId,
      ReadonlyArray<Readonly<{ output: OutputPortKey; to: Readonly<{ nodeId: NodeId; input: InputPortKey }> }>>
    >,
    public readonly expectedInputsByNode: ReadonlyMap<NodeId, ReadonlyArray<InputPortKey>>,
  ) {}

  static fromWorkflow(wf: WorkflowDefinition): WorkflowTopology {
    const defs = new Map<NodeId, NodeDef>();
    for (const n of wf.nodes) defs.set(n.id, n);

    const outgoing = new Map<NodeId, Array<Readonly<{ output: OutputPortKey; to: Readonly<{ nodeId: NodeId; input: InputPortKey }> }>>>();
    for (const e of wf.edges) {
      const list = outgoing.get(e.from.nodeId) ?? [];
      list.push({ output: e.from.output, to: { nodeId: e.to.nodeId, input: e.to.input } });
      outgoing.set(e.from.nodeId, list);
    }

    const incomingByNode = new Map<NodeId, Array<InputPortKey>>();
    for (const e of wf.edges) {
      const list = incomingByNode.get(e.to.nodeId) ?? [];
      list.push(e.to.input);
      incomingByNode.set(e.to.nodeId, list);
    }

    const expected = new Map<NodeId, InputPortKey[]>();
    for (const [toNodeId, inputs] of incomingByNode.entries()) {
      const counts = new Map<InputPortKey, number>();
      for (const k of inputs) counts.set(k, (counts.get(k) ?? 0) + 1);
      for (const [k, n] of counts.entries()) {
        if (n > 1) throw new Error(`Node ${toNodeId} has multiple edges into input '${k}'. Use a Merge node upstream.`);
      }

      const order: InputPortKey[] = [];
      const seen = new Set<InputPortKey>();
      for (const k of inputs) {
        if (seen.has(k)) continue;
        seen.add(k);
        order.push(k);
      }
      expected.set(toNodeId, order);
    }

    return new WorkflowTopology(defs, outgoing, expected);
  }
}

