import type {
  PersistedRunSchedulingState,
  PersistedRunState,
  RunId,
  RunPruneCandidate,
  RunSummary,
  WorkflowExecutionListingRepository,
  WorkflowExecutionPruneRepository,
  WorkflowExecutionRepository,
  WorkflowId,
} from "../types";
import type { RunEventBus } from "./runEvents";

export class EventPublishingWorkflowExecutionRepository
  implements WorkflowExecutionRepository, WorkflowExecutionListingRepository, WorkflowExecutionPruneRepository
{
  constructor(
    private readonly inner: WorkflowExecutionRepository,
    private readonly eventBus: RunEventBus,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createRun(args: Parameters<WorkflowExecutionRepository["createRun"]>[0]): Promise<void> {
    await this.inner.createRun(args);
    await this.eventBus.publish({
      kind: "runCreated",
      runId: args.runId,
      workflowId: args.workflowId,
      parent: args.parent,
      at: this.now().toISOString(),
    });
  }

  async load(runId: RunId): Promise<PersistedRunState | undefined> {
    return await this.inner.load(runId);
  }

  async loadSchedulingState(runId: RunId): Promise<PersistedRunSchedulingState | undefined> {
    return await this.inner.loadSchedulingState(runId);
  }

  async save(state: PersistedRunState): Promise<void> {
    await this.inner.save(state);
    await this.eventBus.publish({
      kind: "runSaved",
      runId: state.runId,
      workflowId: state.workflowId,
      parent: state.parent,
      at: this.now().toISOString(),
      state,
    });
  }

  async deleteRun(runId: RunId): Promise<void> {
    if (!this.inner.deleteRun) return;
    await this.inner.deleteRun(runId);
  }

  async listRuns(args?: Readonly<{ workflowId?: WorkflowId; limit?: number }>): Promise<ReadonlyArray<RunSummary>> {
    const listingRepository = this.inner as unknown as Partial<WorkflowExecutionListingRepository>;
    if (!listingRepository.listRuns) return [];
    return await listingRepository.listRuns(args);
  }

  async listRunsOlderThan(
    args: Readonly<{ beforeIso: string; limit?: number }>,
  ): Promise<ReadonlyArray<RunPruneCandidate>> {
    const pruneRepository = this.inner as unknown as Partial<WorkflowExecutionPruneRepository>;
    if (!pruneRepository.listRunsOlderThan) return [];
    return await pruneRepository.listRunsOlderThan(args);
  }
}
