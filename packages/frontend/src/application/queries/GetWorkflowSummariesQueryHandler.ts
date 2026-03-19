import { HandlesQuery } from "../../infrastructure/di/HandlesQuery";
import type { WorkflowDefinition } from "@codemation/core";
import { CoreTokens, inject } from "@codemation/core";
import type { WorkflowRegistry } from "@codemation/core";
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
