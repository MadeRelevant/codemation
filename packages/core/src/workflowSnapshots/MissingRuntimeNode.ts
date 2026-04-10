import type { RunnableNode, RunnableNodeExecuteArgs } from "../types";

import { MissingRuntimeNodeConfig } from "./MissingRuntimeNodeConfig";

export class MissingRuntimeNode implements RunnableNode<MissingRuntimeNodeConfig> {
  readonly kind = "node" as const;
  readonly outputPorts = ["main"] as const;

  execute(args: RunnableNodeExecuteArgs<MissingRuntimeNodeConfig>): unknown {
    return args.item;
  }
}
