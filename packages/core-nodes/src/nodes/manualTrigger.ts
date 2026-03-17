import type { Items, NodeExecutionContext, NodeOutputs, TriggerNode, TriggerNodeConfig, TriggerSetupContext, TypeToken } from "@codemation/core";
import { node } from "@codemation/core";

export class ManualTrigger<TOutputJson = unknown> implements TriggerNodeConfig<TOutputJson> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = ManualTriggerNode;
  readonly defaultItems?: Items<TOutputJson>;
  readonly id?: string;

  constructor(name?: string, id?: string);
  constructor(name: string, defaultItems: Items<TOutputJson>, id?: string);
  constructor(
    public readonly name: string = "Manual trigger",
    defaultItemsOrId?: Items<TOutputJson> | string,
    id?: string,
  ) {
    this.defaultItems = ManualTrigger.resolveDefaultItems(defaultItemsOrId);
    this.id = ManualTrigger.resolveId(defaultItemsOrId, id);
  }

  private static resolveDefaultItems<TOutputJson>(value: Items<TOutputJson> | string | undefined): Items<TOutputJson> | undefined {
    return typeof value === "string" || value === undefined ? undefined : value;
  }

  private static resolveId<TOutputJson>(value: Items<TOutputJson> | string | undefined, id: string | undefined): string | undefined {
    return typeof value === "string" ? value : id;
  }
}

/**
 * Setup is intentionally a no-op: the engine host can run workflows manually
 * by calling `engine.runWorkflow(workflow, triggerNodeId, items)`.
 */
@node({ packageName: "@codemation/core-nodes" })
export class ManualTriggerNode implements TriggerNode<ManualTrigger<any>> {
  kind = "trigger" as const;
  outputPorts = ["main"] as const;
  async setup(_ctx: TriggerSetupContext<ManualTrigger<any>>): Promise<void> {}

  async execute(items: Items, ctx: NodeExecutionContext<ManualTrigger<any>>): Promise<NodeOutputs> {
    return { main: items.length > 0 ? items : (ctx.config.defaultItems ?? []) };
  }
}

