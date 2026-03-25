import type { ExecutableTriggerNode, Items, NodeOutputs, TriggerSetupContext } from "../../../types";

import { MissingRuntimeTriggerConfig } from "./MissingRuntimeTriggerConfig";

export class MissingRuntimeTrigger implements ExecutableTriggerNode<MissingRuntimeTriggerConfig> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  async setup(_ctx: TriggerSetupContext<MissingRuntimeTriggerConfig>): Promise<undefined> {
    return undefined;
  }

  async execute(items: Items): Promise<NodeOutputs> {
    return { main: items };
  }
}
