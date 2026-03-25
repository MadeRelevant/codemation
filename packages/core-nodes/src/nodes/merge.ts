import type { InputPortKey, RunnableNodeConfig, TypeToken } from "@codemation/core";

import { MergeNode } from "./MergeNode";

export type MergeMode = "passThrough" | "append" | "mergeByPosition";

export class Merge<TInputJson = unknown, TOutputJson = TInputJson> implements RunnableNodeConfig<
  TInputJson,
  TOutputJson
> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = MergeNode;

  constructor(
    public readonly name: string,
    public readonly cfg: Readonly<{
      mode: MergeMode;
      /**
       * Deterministic input precedence order (only used for passThrough/append).
       * Any inputs not listed are appended in lexicographic order.
       */
      prefer?: ReadonlyArray<InputPortKey>;
    }> = { mode: "passThrough" },
    public readonly id?: string,
  ) {}
}

export { MergeNode } from "./MergeNode";
