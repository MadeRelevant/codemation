import type { WorkflowDefinition,WorkflowRegistry } from "@codemation/core";
import { CoreTokens,inject } from "@codemation/core";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { QueryHandler } from "../bus/QueryHandler";
import { GetWorkflowSummariesQuery } from "./GetWorkflowSummariesQuery";

@HandlesQuery.for(GetWorkflowSummariesQuery)
export class GetWorkflowSummariesQueryHandler extends QueryHandler<GetWorkflowSummariesQuery, ReadonlyArray<WorkflowDefinition>> {
  constructor(
    @inject(CoreTokens.WorkflowRegistry)
    private readonly workflowRegistry: WorkflowRegistry,
  ) {
    super();
  }

  async execute(query: GetWorkflowSummariesQuery): Promise<ReadonlyArray<WorkflowDefinition>> {
    void query;
    return [...this.workflowRegistry.list()];
  }
}
