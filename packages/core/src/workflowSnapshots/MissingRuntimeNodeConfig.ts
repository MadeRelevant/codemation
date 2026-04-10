import type { RunnableNodeConfig } from "../types";

import { MissingRuntimeNodeToken } from "./MissingRuntimeNodeToken";

export class MissingRuntimeNodeConfig implements RunnableNodeConfig<unknown, unknown> {
  readonly kind = "node" as const;
  readonly type = MissingRuntimeNodeToken;

  constructor(
    public readonly name: string,
    public readonly missingTokenId?: string,
    public readonly missingRuntime = true,
  ) {}
}
