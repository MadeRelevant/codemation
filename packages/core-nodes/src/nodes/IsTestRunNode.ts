import type { RunnableNode, RunnableNodeExecuteArgs } from "@codemation/core";
import { emitPorts, node } from "@codemation/core";

import { IsTestRun } from "./isTestRun";

/**
 * Routes each item to the `true` port if `ctx.testContext` is set (the run was started by the
 * TestSuiteOrchestrator), else to `false`. Lets workflow authors guard real side-effects:
 *
 *   GmailTrigger / TestTrigger → ClassifyAgent → IsTestRun
 *                                                 ├── true → AssertionNode
 *                                                 └── false → SendReply
 */
@node({ packageName: "@codemation/core-nodes" })
export class IsTestRunNode implements RunnableNode<IsTestRun<unknown>> {
  kind = "node" as const;

  execute(args: RunnableNodeExecuteArgs<IsTestRun<unknown>>): unknown {
    const isTest = args.ctx.testContext !== undefined;
    return emitPorts({
      true: isTest ? [args.item] : [],
      false: isTest ? [] : [args.item],
    });
  }
}
