import type { NodeConfigBase } from "../../../types";

import { MissingRuntimeTriggerToken } from "./MissingRuntimeTriggerToken";

export class MissingRuntimeTriggerConfig implements NodeConfigBase {
  readonly kind = "trigger" as const;
  readonly type = MissingRuntimeTriggerToken;

  constructor(
    public readonly name: string,
    public readonly missingTokenId?: string,
    public readonly missingRuntime = true,
  ) {}
}
