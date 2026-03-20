import type { Items,Node,NodeExecutionContext,NodeOutputs } from "@codemation/core";

import { node } from "@codemation/core";

import { NoOp } from "./noOp";



@node({ packageName: "@codemation/core-nodes" })
export class NoOpNode implements Node<NoOp<any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, _ctx: NodeExecutionContext<NoOp<any>>): Promise<NodeOutputs> {
    return { main: items };
  }
}
