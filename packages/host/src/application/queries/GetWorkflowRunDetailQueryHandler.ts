import type { RunIterationDto, WorkflowRunDetailDto } from "@codemation/core";
import { inject } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type { WorkflowRunRepository } from "../../domain/runs/WorkflowRunRepository";
import { HandlesQuery } from "../../infrastructure/di/HandlesQueryRegistry";
import { QueryHandler } from "../bus/QueryHandler";
import type { IterationCostRollupDto } from "../contracts/IterationCostContracts";
import { GetIterationCostQuery } from "./GetIterationCostQuery";
import { GetIterationCostQueryHandler } from "./GetIterationCostQueryHandler";
import { GetWorkflowRunDetailQuery } from "./GetWorkflowRunDetailQuery";
import { RunIterationProjectionFactory } from "./RunIterationProjectionFactory";

@HandlesQuery.for(GetWorkflowRunDetailQuery)
export class GetWorkflowRunDetailQueryHandler extends QueryHandler<
  GetWorkflowRunDetailQuery,
  WorkflowRunDetailDto | undefined
> {
  constructor(
    @inject(ApplicationTokens.WorkflowRunRepository)
    private readonly workflowRunRepository: WorkflowRunRepository,
    @inject(RunIterationProjectionFactory)
    private readonly runIterationProjectionFactory: RunIterationProjectionFactory,
    @inject(GetIterationCostQueryHandler)
    private readonly getIterationCostQueryHandler: GetIterationCostQueryHandler,
  ) {
    super();
  }

  async execute(query: GetWorkflowRunDetailQuery): Promise<WorkflowRunDetailDto | undefined> {
    const detail = await this.workflowRunRepository.loadRunDetail?.(query.runId);
    if (!detail) {
      return undefined;
    }
    const baseIterations = this.runIterationProjectionFactory.project(detail.executionInstances);
    const iterations = await this.joinIterationCosts(query.runId, baseIterations);
    return { ...detail, iterations };
  }

  private async joinIterationCosts(
    runId: string,
    iterations: ReadonlyArray<RunIterationDto>,
  ): Promise<ReadonlyArray<RunIterationDto>> {
    if (iterations.length === 0) {
      return iterations;
    }
    const rollups = await this.getIterationCostQueryHandler.execute(new GetIterationCostQuery(runId));
    if (rollups.length === 0) {
      return iterations;
    }
    const rollupsByIterationId = new Map<string, IterationCostRollupDto>();
    for (const rollup of rollups) {
      rollupsByIterationId.set(rollup.iterationId, rollup);
    }
    return iterations.map((iteration) => {
      const rollup = rollupsByIterationId.get(iteration.iterationId);
      if (!rollup) {
        return iteration;
      }
      return {
        ...iteration,
        estimatedCostMinorByCurrency: rollup.estimatedCostMinorByCurrency,
        estimatedCostCurrencyScaleByCurrency: rollup.estimatedCostCurrencyScaleByCurrency,
      };
    });
  }
}
