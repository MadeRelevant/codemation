import type { NodeConfigBase, TypeToken } from "@codemation/core";
import { KitchenSinkExampleNode } from "./kitchenSinkExampleNode";

export class KitchenSinkExample implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = KitchenSinkExampleNode;

  constructor(
    public readonly name: string,
    public readonly cfg: Readonly<{
      customerNameField: string;
    }>,
    public readonly id?: string,
  ) {}
}
