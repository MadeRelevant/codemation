import type { NodeConfigBase, TriggerNode, TriggerSetupContext, TypeToken } from "@codemation/core";

export class ManualTrigger implements NodeConfigBase {
  readonly kind = "trigger" as const;
  readonly token: TypeToken<unknown> = ManualTriggerNode;
  constructor(public readonly name: string = "Manual trigger", public readonly id?: string) {}
}

/**
 * Setup is intentionally a no-op: the engine host can run workflows manually
 * by calling `engine.runWorkflow(workflow, triggerNodeId, items)`.
 */
export class ManualTriggerNode implements TriggerNode<ManualTrigger> {
  kind = "trigger" as const;
  outputPorts = ["main"] as const;
  async setup(_ctx: TriggerSetupContext<ManualTrigger>): Promise<void> {}
}

