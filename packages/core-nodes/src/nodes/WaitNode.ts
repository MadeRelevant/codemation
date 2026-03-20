import type { Items,Node,NodeExecutionContext,NodeOutputs } from "@codemation/core";

import { node } from "@codemation/core";

import { Wait } from "./wait";
import { WaitDuration } from "./WaitDuration";

@node({ packageName: "@codemation/core-nodes" })
export class WaitNode implements Node<Wait<any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(items: Items, ctx: NodeExecutionContext<Wait<any>>): Promise<NodeOutputs> {
    const milliseconds = WaitDuration.normalize(ctx.config.milliseconds);
    if (milliseconds > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, milliseconds);
      });
    }
    return { main: items };
  }
}
