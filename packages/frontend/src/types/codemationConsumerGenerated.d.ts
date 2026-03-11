declare module "@codemation/consumer-generated" {
  import type { WorkflowDefinition } from "@codemation/core";

  export const codemationGeneratedWorkflowModules: ReadonlyArray<Readonly<Record<string, unknown>>>;
  export const codemationGeneratedConsumerModules: ReadonlyArray<Readonly<Record<string, unknown>>>;
  export const codemationGeneratedWorkflows: ReadonlyArray<WorkflowDefinition>;
}
