import { HandlesQuery } from "../../infrastructure/di/HandlesQuery";
import type { PersistedRunState } from "@codemation/core";
import { QueryHandler } from "../bus/QueryHandler";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import { GetRunStateQuery } from "./GetRunStateQuery";

@HandlesQuery.for(GetRunStateQuery)
export class GetRunStateQueryHandler extends QueryHandler<GetRunStateQuery, PersistedRunState | undefined> {
  constructor(private readonly workflowRunRepository: WorkflowRunRepository) {
    super();
  }

  async execute(query: GetRunStateQuery): Promise<PersistedRunState | undefined> {
    return await this.workflowRunRepository.load(query.runId);
  }
}
