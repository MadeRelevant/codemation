import type { ParentExecutionRef, PersistedRunState, RunId, RunListingStore, RunStateStore, RunSummary, WorkflowId } from "../types";
import type { RunEventBus } from "./runEvents";

export class PublishingRunStateStore implements RunStateStore, RunListingStore {
  constructor(
    private readonly inner: RunStateStore,
    private readonly eventBus: RunEventBus,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createRun(args: {
    runId: RunId;
    workflowId: WorkflowId;
    startedAt: string;
    parent?: ParentExecutionRef;
    executionOptions?: PersistedRunState["executionOptions"];
    control?: PersistedRunState["control"];
    workflowSnapshot?: PersistedRunState["workflowSnapshot"];
    mutableState?: PersistedRunState["mutableState"];
  }): Promise<void> {
    await this.inner.createRun(args);
    await this.eventBus.publish({ kind: "runCreated", runId: args.runId, workflowId: args.workflowId, parent: args.parent, at: this.now().toISOString() });
  }

  async load(runId: RunId): Promise<PersistedRunState | undefined> {
    return await this.inner.load(runId);
  }

  async save(state: PersistedRunState): Promise<void> {
    await this.inner.save(state);
    await this.eventBus.publish({ kind: "runSaved", runId: state.runId, workflowId: state.workflowId, parent: state.parent, at: this.now().toISOString(), state });
  }

  async listRuns(args?: Readonly<{ workflowId?: WorkflowId; limit?: number }>): Promise<ReadonlyArray<RunSummary>> {
    const innerAny = this.inner as unknown as Partial<RunListingStore>;
    if (!innerAny.listRuns) return [];
    return await innerAny.listRuns(args);
  }
}

