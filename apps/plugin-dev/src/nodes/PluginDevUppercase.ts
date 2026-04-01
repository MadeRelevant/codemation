import type { RunnableNodeConfig, TypeToken } from "@codemation/core";

import { PluginDevUppercaseNode } from "./PluginDevUppercaseNode";

export class PluginDevUppercase<
  TInputJson extends Record<string, unknown> = Record<string, unknown>,
  TField extends keyof TInputJson & string = keyof TInputJson & string,
> implements RunnableNodeConfig<TInputJson, TInputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = PluginDevUppercaseNode;

  constructor(
    public readonly name: string,
    public readonly cfg: Readonly<{ field: TField }>,
    public readonly id?: string,
  ) {}
}
