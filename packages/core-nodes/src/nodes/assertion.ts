import type { AssertionResult, Item, NodeExecutionContext, RunnableNodeConfig, TypeToken } from "@codemation/core";

import { AssertionNode } from "./AssertionNode";

export interface AssertionOptions<TInputJson> {
  readonly name?: string;
  readonly id?: string;
  readonly icon?: string;
  /**
   * Author callback. Returns one or more {@link AssertionResult}s per input item. Each becomes
   * one emitted output item — useful for per-row reporting in the Tests tab. Return `[]` to
   * emit nothing for this case (rare; usually you want at least a "no-op" pass).
   */
  assertions(
    item: Item<TInputJson>,
    ctx: NodeExecutionContext<Assertion<TInputJson>>,
  ): Promise<ReadonlyArray<AssertionResult>> | ReadonlyArray<AssertionResult>;
}

/**
 * Generic assertion node — the "callback" form. For declarative shorthands (StringEquals,
 * JudgeByAgent) compose this with helpers added in later phases. Sets `emitsAssertions: true`
 * so host-side persisters know to record its outputs as `TestAssertion` rows.
 */
export class Assertion<TInputJson = unknown> implements RunnableNodeConfig<TInputJson, AssertionResult> {
  readonly kind = "node" as const;
  readonly type: TypeToken<unknown> = AssertionNode;
  readonly icon: string;
  readonly name: string;
  readonly id?: string;
  readonly emitsAssertions = true as const;
  readonly assertions: AssertionOptions<TInputJson>["assertions"];

  constructor(options: AssertionOptions<TInputJson>) {
    this.name = options.name ?? "Assertion";
    this.id = options.id;
    this.icon = options.icon ?? "lucide:check-circle";
    this.assertions = options.assertions;
  }
}

export { AssertionNode } from "./AssertionNode";
