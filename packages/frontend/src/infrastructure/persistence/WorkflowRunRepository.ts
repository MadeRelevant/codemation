import type { PersistedRunState,RunListingStore,RunStateStore,RunSummary } from "@codemation/core";
import { CoreTokens,inject,injectable } from "@codemation/core";
import type { WorkflowRunRepository as WorkflowRunRepositoryContract } from "../../domain/runs/WorkflowRunRepository";

@injectable()
export class WorkflowRunRepository implements WorkflowRunRepositoryContract {
  constructor(@inject(CoreTokens.RunStateStore) private readonly runStateStore: RunStateStore) {}

  async load(runId: string): Promise<PersistedRunState | undefined> {
    return (await this.runStateStore.load(decodeURIComponent(runId))) as PersistedRunState | undefined;
  }

  async save(state: PersistedRunState): Promise<void> {
    await this.runStateStore.save(state);
  }

  async listRuns(args: Readonly<{ workflowId?: string; limit?: number }>): Promise<ReadonlyArray<RunSummary>> {
    const listingStore = this.runStateStore as unknown as Partial<RunListingStore>;
    if (!listingStore.listRuns) {
      return [];
    }
    return (await listingStore.listRuns({
      workflowId: args.workflowId ? decodeURIComponent(args.workflowId) : undefined,
      limit: args.limit,
    })) as ReadonlyArray<RunSummary>;
  }
}
