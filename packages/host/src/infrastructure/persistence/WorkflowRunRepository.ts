import type {
  PersistedRunState,
  RunId,
  RunSummary,
  WorkflowExecutionListingRepository,
  WorkflowExecutionRepository,
} from "@codemation/core";
import { CoreTokens, inject, injectable } from "@codemation/core";
import type { WorkflowRunRepository as WorkflowRunRepositoryContract } from "../../domain/runs/WorkflowRunRepository";

@injectable()
export class WorkflowRunRepository implements WorkflowRunRepositoryContract {
  constructor(
    @inject(CoreTokens.WorkflowExecutionRepository)
    private readonly workflowExecutionRepository: WorkflowExecutionRepository,
  ) {}

  async load(runId: string): Promise<PersistedRunState | undefined> {
    return (await this.workflowExecutionRepository.load(decodeURIComponent(runId))) as PersistedRunState | undefined;
  }

  async save(state: PersistedRunState): Promise<void> {
    await this.workflowExecutionRepository.save(state);
  }

  async listRuns(args: Readonly<{ workflowId?: string; limit?: number }>): Promise<ReadonlyArray<RunSummary>> {
    const listingStore = this.workflowExecutionRepository as unknown as Partial<WorkflowExecutionListingRepository>;
    if (!listingStore.listRuns) {
      return [];
    }
    return (await listingStore.listRuns({
      workflowId: args.workflowId ? decodeURIComponent(args.workflowId) : undefined,
      limit: args.limit,
    })) as ReadonlyArray<RunSummary>;
  }

  async deleteRun(runId: RunId): Promise<void> {
    const id = decodeURIComponent(runId) as RunId;
    const deletable = this.workflowExecutionRepository as WorkflowExecutionRepository & {
      deleteRun?: (rid: RunId) => Promise<void>;
    };
    if (deletable.deleteRun) {
      await deletable.deleteRun(id);
    }
  }
}
