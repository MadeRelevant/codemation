import type { Item, Items, NodeExecutionContext, RunnableNodeConfig, TypeToken } from "@codemation/core";

import { SwitchNode } from "./SwitchNode";

export type SwitchCaseKeyResolver<TInputJson = unknown> = (
  item: Item<TInputJson>,
  index: number,
  items: Items<TInputJson>,
  ctx: NodeExecutionContext<Switch<TInputJson>>,
) => string | Promise<string>;

export class Switch<TInputJson = unknown> implements RunnableNodeConfig<TInputJson, TInputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = SwitchNode;
  readonly execution = { hint: "local" } as const;
  readonly icon = "lucide:git-branch-plus" as const;
  readonly lineageCarry = "carryThrough" as const;
  readonly declaredOutputPorts: ReadonlyArray<string>;

  constructor(
    public readonly name: string,
    public readonly cfg: Readonly<{
      cases: readonly string[];
      defaultCase: string;
      resolveCaseKey: SwitchCaseKeyResolver<TInputJson>;
    }>,
    public readonly id?: string,
  ) {
    this.declaredOutputPorts = [...new Set([...cfg.cases, cfg.defaultCase])].sort();
  }
}

export { SwitchNode } from "./SwitchNode";
