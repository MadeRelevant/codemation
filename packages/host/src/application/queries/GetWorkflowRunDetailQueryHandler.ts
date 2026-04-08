import type { WorkflowRunDetailDto } from "@codemation/core";
import { inject } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { QueryHandler } from "../bus/QueryHandler";
import { GetWorkflowRunDetailQuery } from "./GetWorkflowRunDetailQuery";

@HandlesQuery.for(GetWorkflowRunDetailQuery)
export class GetWorkflowRunDetailQueryHandler extends QueryHandler<
  GetWorkflowRunDetailQuery,
  WorkflowRunDetailDto | undefined
> {
  constructor(
    @inject(ApplicationTokens.WorkflowRunRepository)
    private readonly workflowRunRepository: WorkflowRunRepository,
  ) {
    super();
  }

  async execute(query: GetWorkflowRunDetailQuery): Promise<WorkflowRunDetailDto | undefined> {
    return await this.workflowRunRepository.loadRunDetail?.(query.runId);
  }
}
