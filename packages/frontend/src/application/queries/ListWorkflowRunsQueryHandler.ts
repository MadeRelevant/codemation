import { HandlesQuery } from "../../infrastructure/di/HandlesQuery";
import type { RunSummary } from "@codemation/core";
import { QueryHandler } from "../bus/QueryHandler";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import { ListWorkflowRunsQuery } from "./ListWorkflowRunsQuery";

@HandlesQuery.for(ListWorkflowRunsQuery)
export class ListWorkflowRunsQueryHandler extends QueryHandler<ListWorkflowRunsQuery, ReadonlyArray<RunSummary>> {
  constructor(private readonly workflowRunRepository: WorkflowRunRepository) {
    super();
  }

  async execute(query: ListWorkflowRunsQuery): Promise<ReadonlyArray<RunSummary>> {
    return await this.workflowRunRepository.listRuns({ workflowId: query.workflowId, limit: 50 });
  }
}
