import type { RunSummary } from "@codemation/core";
import { Query } from "../bus/Query";

export class ListWorkflowRunsQuery extends Query<ReadonlyArray<RunSummary>> {
  constructor(public readonly workflowId: string) {
    super();
  }
}
