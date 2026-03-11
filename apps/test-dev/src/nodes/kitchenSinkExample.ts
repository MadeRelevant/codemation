import type { TypeToken, NodeConfigBase } from "@codemation/core";
import { KitchenSinkExampleNode } from "./kitchenSinkExampleNode";

export class KitchenSinkExample implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly token: TypeToken<unknown> = KitchenSinkExampleNode;

  constructor(
    public readonly name: string,
    public readonly cfg: Readonly<{
      customerNameField: string;
    }>,
    public readonly id?: string,
  ) {}
}
