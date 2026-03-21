import type { WorkflowDefinition } from "@codemation/core";

export interface WorkflowDefinitionRepository {
  listDefinitions(): Promise<ReadonlyArray<WorkflowDefinition>>;

  getDefinition(workflowId: string): Promise<WorkflowDefinition | undefined>;

  resolveSnapshot(args: Readonly<{ workflowId: string; workflowSnapshot?: unknown }>): Promise<WorkflowDefinition | undefined>;
}
