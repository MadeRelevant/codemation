import { inject } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { WorkflowDebuggerOverlayRepository } from "../../domain/workflows/WorkflowDebuggerOverlayRepository";
import type { WorkflowDebuggerOverlayState } from "../../domain/workflows/WorkflowDebuggerOverlayState";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { QueryHandler } from "../bus/QueryHandler";
import { WorkflowDebuggerOverlayStateFactory } from "../workflows/WorkflowDebuggerOverlayStateFactory";
import { GetWorkflowDebuggerOverlayQuery } from "./GetWorkflowDebuggerOverlayQuery";

@HandlesQuery.for(GetWorkflowDebuggerOverlayQuery)
export class GetWorkflowDebuggerOverlayQueryHandler extends QueryHandler<
  GetWorkflowDebuggerOverlayQuery,
  WorkflowDebuggerOverlayState
> {
  constructor(
    @inject(ApplicationTokens.WorkflowDebuggerOverlayRepository)
    private readonly workflowDebuggerOverlayRepository: WorkflowDebuggerOverlayRepository,
  ) {
    super();
  }

  async execute(query: GetWorkflowDebuggerOverlayQuery): Promise<WorkflowDebuggerOverlayState> {
    return (await this.workflowDebuggerOverlayRepository.load(query.workflowId)) ?? WorkflowDebuggerOverlayStateFactory.createEmpty(query.workflowId);
  }
}
