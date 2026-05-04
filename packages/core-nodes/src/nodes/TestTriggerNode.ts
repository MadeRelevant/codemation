import type {
  Items,
  NodeExecutionContext,
  NodeOutputs,
  TestTriggerNodeConfig,
  TriggerNode,
  TriggerSetupContext,
} from "@codemation/core";

import { node } from "@codemation/core";

/**
 * Author-defined test-fixture trigger. Live activation skips this trigger (filtered by
 * `triggerKind === "test"` in `TriggerRuntimeService`); the `TestSuiteOrchestrator` drives its
 * `generateItems` callback during a TestSuiteRun and dispatches one workflow run per yielded item.
 *
 * `setup` is intentionally a no-op for symmetry with other trigger nodes — the real work happens
 * in the orchestrator. `execute` is a passthrough so items provided to `engine.runWorkflow(...)`
 * (one per case) flow downstream unchanged on `main`.
 */
@node({ packageName: "@codemation/core-nodes" })
export class TestTriggerNode implements TriggerNode<TestTriggerNodeConfig<any>> {
  kind = "trigger" as const;
  outputPorts = ["main"] as const;

  async setup(_ctx: TriggerSetupContext<TestTriggerNodeConfig<any>>): Promise<undefined> {
    return undefined;
  }

  async execute(items: Items, _ctx: NodeExecutionContext<TestTriggerNodeConfig<any>>): Promise<NodeOutputs> {
    return { main: items };
  }
}
