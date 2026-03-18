import type { Items, NodeExecutionContext, NodeOutputs, TriggerNode, TriggerNodeConfig, TriggerSetupContext, TypeToken } from "@codemation/core";
import { ItemsInputNormalizer, node } from "@codemation/core";

type ManualTriggerDefaultValue<TOutputJson> = Items<TOutputJson> | ReadonlyArray<TOutputJson> | TOutputJson;

export class ManualTrigger<TOutputJson = unknown> implements TriggerNodeConfig<TOutputJson> {
  private static readonly itemsInputNormalizer = new ItemsInputNormalizer();
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = ManualTriggerNode;
  readonly defaultItems?: Items<TOutputJson>;
  readonly id?: string;

  constructor(name?: string, id?: string);
  constructor(name: string, defaultItems: ManualTriggerDefaultValue<TOutputJson>, id?: string);
  constructor(
    public readonly name: string = "Manual trigger",
    defaultItemsOrId?: ManualTriggerDefaultValue<TOutputJson> | string,
    id?: string,
  ) {
    this.defaultItems = ManualTrigger.resolveDefaultItems(defaultItemsOrId);
    this.id = ManualTrigger.resolveId(defaultItemsOrId, id);
  }

  private static resolveDefaultItems<TOutputJson>(
    value: ManualTriggerDefaultValue<TOutputJson> | string | undefined,
  ): Items<TOutputJson> | undefined {
    if (typeof value === "string" || value === undefined) {
      return undefined;
    }
    return this.itemsInputNormalizer.normalize(value) as Items<TOutputJson>;
  }

  private static resolveId<TOutputJson>(
    value: ManualTriggerDefaultValue<TOutputJson> | string | undefined,
    id: string | undefined,
  ): string | undefined {
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

