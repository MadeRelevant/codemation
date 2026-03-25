import type { WorkflowDefinition } from "@codemation/core";
import { inject } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { WorkflowDefinitionRepository } from "../../domain/workflows/WorkflowDefinitionRepository";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { QueryHandler } from "../bus/QueryHandler";
import { GetWorkflowDetailQuery } from "./GetWorkflowDetailQuery";

@HandlesQuery.for(GetWorkflowDetailQuery)
export class GetWorkflowDetailQueryHandler extends QueryHandler<
  GetWorkflowDetailQuery,
  WorkflowDefinition | undefined
> {
  constructor(
    @inject(ApplicationTokens.WorkflowDefinitionRepository)
    private readonly workflowDefinitionRepository: WorkflowDefinitionRepository,
  ) {
    super();
  }

  async execute(query: GetWorkflowDetailQuery): Promise<WorkflowDefinition | undefined> {
    return await this.workflowDefinitionRepository.getDefinition(query.workflowId);
  }
}
