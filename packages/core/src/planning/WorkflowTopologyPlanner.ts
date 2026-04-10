import type { InputPortKey, NodeId, OutputPortKey, WorkflowDefinition } from "../types";
import { WorkflowExecutableNodeClassifierFactory } from "../workflow/definition/WorkflowExecutableNodeClassifierFactory";

type NodeDef = WorkflowDefinition["nodes"][number];

export type TopologyIncomingEdge = Readonly<{
  from: Readonly<{ nodeId: NodeId; output: OutputPortKey }>;
  input: InputPortKey;
  collectKey: InputPortKey;
}>;

export type TopologyOutgoingEdge = Readonly<{
  output: OutputPortKey;
  to: Readonly<{ nodeId: NodeId; input: InputPortKey; collectKey: InputPortKey }>;
}>;

export class WorkflowTopology {
  private constructor(
    public readonly defsById: ReadonlyMap<NodeId, NodeDef>,
    public readonly outgoingByNode: ReadonlyMap<NodeId, ReadonlyArray<TopologyOutgoingEdge>>,
    public readonly incomingByNode: ReadonlyMap<NodeId, ReadonlyArray<TopologyIncomingEdge>>,
    public readonly expectedInputsByNode: ReadonlyMap<NodeId, ReadonlyArray<InputPortKey>>,
    public readonly rootNodeIds: ReadonlyArray<NodeId>,
  ) {}

  static fromWorkflow(wf: WorkflowDefinition): WorkflowTopology {
    const classifier = WorkflowExecutableNodeClassifierFactory.create(wf);
    const defs = new Map<NodeId, NodeDef>();
    for (const n of wf.nodes) {
      if (classifier.isExecutableNodeId(n.id)) defs.set(n.id, n);
    }

    const incomingByNode = new Map<NodeId, TopologyIncomingEdge[]>();
    for (const e of wf.edges) {
      if (!classifier.isExecutableNodeId(e.from.nodeId) || !classifier.isExecutableNodeId(e.to.nodeId)) {
        continue;
      }
      const list = incomingByNode.get(e.to.nodeId) ?? [];
      list.push({
        from: { nodeId: e.from.nodeId, output: e.from.output },
        input: e.to.input,
        collectKey: e.to.input,
      });
      incomingByNode.set(e.to.nodeId, list);
    }

    const duplicateInputCounts = new Map<NodeId, Map<InputPortKey, number>>();
    for (const [toNodeId, edges] of incomingByNode.entries()) {
      const counts = new Map<InputPortKey, number>();
      for (const edge of edges) {
        counts.set(edge.input, (counts.get(edge.input) ?? 0) + 1);
      }
      duplicateInputCounts.set(toNodeId, counts);
    }

    for (const [toNodeId, edges] of incomingByNode.entries()) {
      const counts = duplicateInputCounts.get(toNodeId) ?? new Map();
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i]!;
        const dup = (counts.get(edge.input) ?? 0) > 1;
        const collectKey = dup ? `${edge.from.nodeId}:${edge.from.output}` : edge.input;
        edges[i] = { ...edge, collectKey };
      }
    }

    const outgoing = new Map<NodeId, TopologyOutgoingEdge[]>();
    for (const e of wf.edges) {
      if (!classifier.isExecutableNodeId(e.from.nodeId) || !classifier.isExecutableNodeId(e.to.nodeId)) {
        continue;
      }
      const counts = duplicateInputCounts.get(e.to.nodeId) ?? new Map();
      const dup = (counts.get(e.to.input) ?? 0) > 1;
      const collectKey = dup ? `${e.from.nodeId}:${e.from.output}` : e.to.input;
      const list = outgoing.get(e.from.nodeId) ?? [];
      list.push({
        output: e.from.output,
        to: { nodeId: e.to.nodeId, input: e.to.input, collectKey },
      });
      outgoing.set(e.from.nodeId, list);
    }

    const expected = new Map<NodeId, InputPortKey[]>();
    for (const [toNodeId, edges] of incomingByNode.entries()) {
      const order: InputPortKey[] = [];
      const seen = new Set<InputPortKey>();
      for (const edge of edges) {
        if (seen.has(edge.collectKey)) {
          continue;
        }
        seen.add(edge.collectKey);
        order.push(edge.collectKey);
      }
      expected.set(toNodeId, order);
    }

    const rootNodeIds = wf.nodes
      .filter((node) => classifier.isExecutableNodeId(node.id) && !incomingByNode.has(node.id))
      .map((node) => node.id);
    return new WorkflowTopology(defs, outgoing, incomingByNode, expected, rootNodeIds);
  }
}
