import type { WorkflowDefinition } from "@codemation/core";
import { Query } from "../bus/Query";

export class GetWorkflowDetailQuery extends Query<WorkflowDefinition | undefined> {
  constructor(public readonly workflowId: string) {
    super();
  }
}
