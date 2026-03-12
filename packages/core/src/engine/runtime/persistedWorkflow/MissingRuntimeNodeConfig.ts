import type { NodeConfigBase } from "../../../types";
import { MissingRuntimeNodeToken } from "./MissingRuntimeNodeToken";

export class MissingRuntimeNodeConfig implements NodeConfigBase {
  readonly kind = "node" as const;
  readonly type = MissingRuntimeNodeToken;

  constructor(
    public readonly name: string,
    public readonly missingTokenId?: string,
    public readonly missingRuntime = true,
  ) {}
}
