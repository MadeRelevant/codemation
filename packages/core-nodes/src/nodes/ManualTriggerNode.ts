import type {
Items,
NodeExecutionContext,
NodeOutputs,
TestableTriggerNode,
TriggerSetupContext,
TriggerTestItemsContext
} from "@codemation/core";

import { node } from "@codemation/core";

import { ManualTrigger } from "./ManualTriggerFactory";



/**
 * Setup is intentionally a no-op: the engine host can run workflows manually
 * by calling `engine.runWorkflow(workflow, triggerNodeId, items)`.
 */
@node({ packageName: "@codemation/core-nodes" })
export class ManualTriggerNode implements TestableTriggerNode<ManualTrigger<any>> {
  kind = "trigger" as const;
  outputPorts = ["main"] as const;
  async setup(_ctx: TriggerSetupContext<ManualTrigger<any>>): Promise<undefined> {
    return undefined;
  }

  async getTestItems(ctx: TriggerTestItemsContext<ManualTrigger<any>>): Promise<Items> {
    return this.resolveManualItems([], ctx.config);
  }

  async execute(items: Items, ctx: NodeExecutionContext<ManualTrigger<any>>): Promise<NodeOutputs> {
    return { main: this.resolveManualItems(items, ctx.config) };
  }

  private resolveManualItems(items: Items, config: ManualTrigger<any>): Items {
    return items.length > 0 ? items : (config.defaultItems ?? []);
  }
}
