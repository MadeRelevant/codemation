import type { WorkflowId } from "@codemation/core";
import { WorkflowBuilder } from "@codemation/core";

export function createWorkflowBuilder(meta: Readonly<{ id: WorkflowId; name: string }>): WorkflowBuilder {
  return new WorkflowBuilder(meta);
}
