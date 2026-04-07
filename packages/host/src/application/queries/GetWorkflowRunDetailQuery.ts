import type { WorkflowRunDetailDto } from "@codemation/core";
import { Query } from "../bus/Query";

export class GetWorkflowRunDetailQuery extends Query<WorkflowRunDetailDto | undefined> {
  constructor(public readonly runId: string) {
    super();
  }
}
