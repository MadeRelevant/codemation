import { HandlesQuery } from "../../infrastructure/di/HandlesQuery";
import type { WorkflowDefinition } from "@codemation/core";
import { inject } from "@codemation/core";
import { QueryHandler } from "../bus/QueryHandler";
import { ApplicationTokens } from "../../applicationTokens";
import type { WorkflowDefinitionRepository } from "../../domain/workflows/WorkflowDefinitionRepository";
import { GetWorkflowSummariesQuery } from "./GetWorkflowSummariesQuery";

@HandlesQuery.for(GetWorkflowSummariesQuery)
export class GetWorkflowSummariesQueryHandler extends QueryHandler<GetWorkflowSummariesQuery, ReadonlyArray<WorkflowDefinition>> {
  constructor(
    @inject(ApplicationTokens.WorkflowDefinitionRepository)
    private readonly workflowDefinitionRepository: WorkflowDefinitionRepository,
  ) {
    super();
  }

  async execute(query: GetWorkflowSummariesQuery): Promise<ReadonlyArray<WorkflowDefinition>> {
    void query;
    return await this.workflowDefinitionRepository.listDefinitions();
  }
}
