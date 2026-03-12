import type { InputPortKey, NodeConfigBase, NodeDefinition, NodeRef, OutputPortKey, WorkflowDefinition, WorkflowId } from "../../dist/index.js";
import { WorkflowBuilder } from "../../dist/index.js";

type Meta = Readonly<{ id: WorkflowId; name: string }>;

function tokenName(config: NodeConfigBase): string {
  return config.tokenId;
}

export function chain(meta: Meta): WorkflowBuilder {
  return new WorkflowBuilder(meta);
}

export function dag(meta: Meta) {
  const nodes: NodeDefinition[] = [];
  const edges: WorkflowDefinition["edges"] = [];
  let seq = 0;

  function add(config: NodeConfigBase): NodeRef {
    const id = config.id ?? `${tokenName(config)}:${++seq}`;
    nodes.push({ id, kind: config.kind, token: config.token, tokenId: config.tokenId, name: config.name, config });
    return { id, kind: config.kind, name: config.name };
  }

  function connect(from: NodeRef | string, to: NodeRef | string, fromOutput: OutputPortKey = "main", toInput: InputPortKey = "in"): void {
    const fromId = typeof from === "string" ? from : from.id;
    const toId = typeof to === "string" ? to : to.id;
    edges.push({ from: { nodeId: fromId, output: fromOutput }, to: { nodeId: toId, input: toInput } });
  }

  function build(): WorkflowDefinition {
    return { ...meta, nodes, edges };
  }

  return {
    add,
    node: add,
    connect,
    edge: connect,
    build,
    nodes: () => nodes.slice(),
    edges: () => edges.slice(),
  };
}

