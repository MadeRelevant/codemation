import type { RunnableNodeConfig, TypeToken } from "@codemation/core";

import { IsTestRunNode } from "./IsTestRunNode";

/**
 * Branches per-item on whether the current run is a test run. Output ports: `true`, `false`.
 * The wire payload is unchanged — this is a router, not a transform.
 */
export class IsTestRun<TInputJson = unknown> implements RunnableNodeConfig<TInputJson, TInputJson> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = IsTestRunNode;
  readonly execution = { hint: "local" } as const;
  readonly icon = "lucide:flask-conical" as const;
  readonly declaredOutputPorts = ["true", "false"] as const;
  readonly name: string;
  readonly id?: string;

  constructor(name: string = "Is test run?", id?: string) {
    this.name = name;
    this.id = id;
  }
}

export { IsTestRunNode } from "./IsTestRunNode";
