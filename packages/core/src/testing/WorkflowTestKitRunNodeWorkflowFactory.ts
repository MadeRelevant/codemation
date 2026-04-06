import type { RunnableNodeConfig, WorkflowDefinition, WorkflowId } from "../types";
import { WorkflowBuilder } from "../workflow/dsl/WorkflowBuilder";

import { WorkflowTestHarnessManualTriggerConfig } from "./WorkflowTestHarnessManualTrigger";

const defaultInlineWorkflowId = "codemation.testing.workflowkit.inline" as WorkflowId;
const defaultInlineWorkflowName = "WorkflowTestKit inline";

/**
 * Builds the minimal trigger → runnable workflow used by {@link import("./WorkflowTestKit").WorkflowTestKit.runNode}.
 */
export class WorkflowTestKitRunNodeWorkflowFactory {
  build(args: { node: RunnableNodeConfig; workflowId?: WorkflowId; workflowName?: string }): WorkflowDefinition {
    const workflowId = args.workflowId ?? defaultInlineWorkflowId;
    const workflowName = args.workflowName ?? defaultInlineWorkflowName;
    const trigger = new WorkflowTestHarnessManualTriggerConfig(
      "WorkflowTestKit trigger",
      "workflowkit.harness.trigger",
    );
    return new WorkflowBuilder({ id: workflowId, name: workflowName }).trigger(trigger).then(args.node).build();
  }

  defaultStartNodeId(): string {
    return "workflowkit.harness.trigger";
  }
}
