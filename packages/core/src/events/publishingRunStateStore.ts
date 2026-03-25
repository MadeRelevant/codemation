import type {
  PersistedRunState,
  RunId,
  RunListingStore,
  RunPruneCandidate,
  RunPruneListingStore,
  RunStateStore,
  RunSummary,
  WorkflowId,
} from "../types";
import type { RunEventBus } from "./runEvents";

export class PublishingRunStateStore implements RunStateStore, RunListingStore, RunPruneListingStore {
  constructor(
    private readonly inner: RunStateStore,
    private readonly eventBus: RunEventBus,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createRun(args: Parameters<RunStateStore["createRun"]>[0]): Promise<void> {
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
    const innerAny = this.inner as unknown as Partial<RunListingStore>;
    if (!innerAny.listRuns) return [];
    return await innerAny.listRuns(args);
  }

  async listRunsOlderThan(
    args: Readonly<{ beforeIso: string; limit?: number }>,
  ): Promise<ReadonlyArray<RunPruneCandidate>> {
    const innerAny = this.inner as unknown as Partial<RunPruneListingStore>;
    if (!innerAny.listRunsOlderThan) return [];
    return await innerAny.listRunsOlderThan(args);
  }
}
