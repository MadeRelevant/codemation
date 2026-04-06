/* eslint-disable codemation/single-class-per-file -- Trigger config and implementation share a TypeToken pairing. */
import type { TypeToken } from "../di";
import type {
  Items,
  NodeExecutionContext,
  NodeOutputs,
  TriggerNode,
  TriggerNodeConfig,
  TriggerSetupContext,
} from "../types";

/**
 * Minimal pass-through manual trigger for {@link WorkflowTestKit.runNode}; emits input items unchanged.
 */
export class WorkflowTestHarnessManualTriggerConfig implements TriggerNodeConfig<unknown> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = WorkflowTestHarnessManualTriggerNode;

  constructor(
    public readonly name: string,
    public readonly id?: string,
  ) {}
}

export class WorkflowTestHarnessManualTriggerNode implements TriggerNode<WorkflowTestHarnessManualTriggerConfig> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  async setup(_ctx: TriggerSetupContext<WorkflowTestHarnessManualTriggerConfig>): Promise<undefined> {
    return undefined;
  }

  async execute(
    items: Items,
    _ctx: NodeExecutionContext<WorkflowTestHarnessManualTriggerConfig>,
  ): Promise<NodeOutputs> {
    return { main: items };
  }
}
