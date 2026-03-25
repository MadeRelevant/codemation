import type { Items, TriggerNodeConfig, TypeToken } from "@codemation/core";

import { ItemsInputNormalizer } from "@codemation/core";

import { ManualTriggerNode } from "./ManualTriggerNode";

type ManualTriggerDefaultValue<TOutputJson> = Items<TOutputJson> | ReadonlyArray<TOutputJson> | TOutputJson;

export class ManualTrigger<TOutputJson = unknown> implements TriggerNodeConfig<TOutputJson> {
  private static readonly itemsInputNormalizer = new ItemsInputNormalizer();
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = ManualTriggerNode;
  readonly icon = "lucide:play" as const;
  readonly defaultItems?: Items<TOutputJson>;
  readonly id?: string;
  /** Manual runs often emit an empty batch; still schedule downstream by default. */
  readonly continueWhenEmptyOutput = true as const;

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

export { ManualTriggerNode } from "./ManualTriggerNode";
