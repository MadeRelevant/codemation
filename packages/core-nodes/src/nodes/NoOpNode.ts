import type { RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";

import { node } from "@codemation/core";

import { NoOp } from "./noOp";

@node({ packageName: "@codemation/core-nodes" })
export class NoOpNode implements RunnableNode<NoOp<any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  execute(args: RunnableNodeExecuteArgs<NoOp<any>>): unknown {
    return args.item;
  }
}
