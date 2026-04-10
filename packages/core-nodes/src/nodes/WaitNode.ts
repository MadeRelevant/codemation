import type { RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";

import { node } from "@codemation/core";

import { Wait } from "./wait";
import { WaitDuration } from "./WaitDurationFactory";

@node({ packageName: "@codemation/core-nodes" })
export class WaitNode implements RunnableNode<Wait<any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<Wait<any>>): Promise<unknown> {
    if (args.itemIndex === 0) {
      const milliseconds = WaitDuration.normalize(args.ctx.config.milliseconds);
      if (milliseconds > 0) {
        await new Promise<void>((resolve) => {
          setTimeout(resolve, milliseconds);
        });
      }
    }
    return args.item;
  }
}
