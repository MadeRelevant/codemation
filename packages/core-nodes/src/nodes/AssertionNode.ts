import type { AssertionResult, RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";
import { node } from "@codemation/core";

import { Assertion } from "./assertion";

/**
 * Runs the author's `assertions` callback for each input item and emits one workflow `Item` per
 * returned {@link AssertionResult} on `main`. Persistence is handled by a host-side subscriber
 * to `nodeCompleted` events that filters on `config.emitsAssertions === true`; this node does
 * not write to any store on its own.
 */
@node({ packageName: "@codemation/core-nodes" })
export class AssertionNode implements RunnableNode<Assertion<any>> {
  kind = "node" as const;
  outputPorts = ["main"] as const;

  async execute(args: RunnableNodeExecuteArgs<Assertion<any>>): Promise<unknown> {
    const ctx = args.ctx;
    const config = ctx.config;
    const results: ReadonlyArray<AssertionResult> = await config.assertions(args.item, ctx);
    // Engine "array → fan-out on main, each element is item.json" — returning the plain results
    // makes downstream `item.json` exactly an AssertionResult. Wrapping in `{ json: result }`
    // would double-wrap (engine would see `Item`-shaped values but treat them as JSON values).
    return [...results];
  }
}
