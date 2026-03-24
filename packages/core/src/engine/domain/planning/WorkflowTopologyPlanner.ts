import type { InputPortKey, NodeId, OutputPortKey, WorkflowDefinition } from "../../../types";
import { createWorkflowExecutableNodeClassifier } from "../../../workflow/workflowExecutableNodeClassifier.types";

type NodeDef = WorkflowDefinition["nodes"][number];

export class WorkflowTopology {
  private constructor(
    public readonly defsById: ReadonlyMap<NodeId, NodeDef>,
    public readonly outgoingByNode: ReadonlyMap<
      NodeId,
      ReadonlyArray<Readonly<{ output: OutputPortKey; to: Readonly<{ nodeId: NodeId; input: InputPortKey }> }>>
    >,
    public readonly incomingByNode: ReadonlyMap<
      NodeId,
      ReadonlyArray<Readonly<{ from: Readonly<{ nodeId: NodeId; output: OutputPortKey }>; input: InputPortKey }>>
    >,
    public readonly expectedInputsByNode: ReadonlyMap<NodeId, ReadonlyArray<InputPortKey>>,
    public readonly rootNodeIds: ReadonlyArray<NodeId>,
  ) {}

  static fromWorkflow(wf: WorkflowDefinition): WorkflowTopology {
    const classifier = createWorkflowExecutableNodeClassifier(wf);
    const defs = new Map<NodeId, NodeDef>();
    for (const n of wf.nodes) {
      if (classifier.isExecutableNodeId(n.id)) defs.set(n.id, n);
    }

    const outgoing = new Map<NodeId, Array<Readonly<{ output: OutputPortKey; to: Readonly<{ nodeId: NodeId; input: InputPortKey }> }>>>();
    for (const e of wf.edges) {
      if (!classifier.isExecutableNodeId(e.from.nodeId) || !classifier.isExecutableNodeId(e.to.nodeId)) {
        continue;
      }
      const list = outgoing.get(e.from.nodeId) ?? [];
      list.push({ output: e.from.output, to: { nodeId: e.to.nodeId, input: e.to.input } });
      outgoing.set(e.from.nodeId, list);
    }

    const incomingByNode = new Map<
      NodeId,
      Array<Readonly<{ from: Readonly<{ nodeId: NodeId; output: OutputPortKey }>; input: InputPortKey }>>
    >();
    for (const e of wf.edges) {
      if (!classifier.isExecutableNodeId(e.from.nodeId) || !classifier.isExecutableNodeId(e.to.nodeId)) {
        continue;
      }
      const list = incomingByNode.get(e.to.nodeId) ?? [];
      list.push({ from: { nodeId: e.from.nodeId, output: e.from.output }, input: e.to.input });
      incomingByNode.set(e.to.nodeId, list);
    }

    const expected = new Map<NodeId, InputPortKey[]>();
    for (const [toNodeId, inputs] of incomingByNode.entries()) {
      const counts = new Map<InputPortKey, number>();
      for (const edge of inputs) counts.set(edge.input, (counts.get(edge.input) ?? 0) + 1);
      for (const [k, n] of counts.entries()) {
        if (n > 1) throw new Error(`Node ${toNodeId} has multiple edges into input '${k}'. Use a Merge node upstream.`);
      }

      const order: InputPortKey[] = [];
      const seen = new Set<InputPortKey>();
      for (const edge of inputs) {
        if (seen.has(edge.input)) continue;
        seen.add(edge.input);
        order.push(edge.input);
      }
      expected.set(toNodeId, order);
    }

    const rootNodeIds = wf.nodes
      .filter((node) => classifier.isExecutableNodeId(node.id) && !incomingByNode.has(node.id))
      .map((node) => node.id);
    return new WorkflowTopology(defs, outgoing, incomingByNode, expected, rootNodeIds);
  }
}

