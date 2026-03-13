import type { PersistedRunState, RunSummary } from "@codemation/core";

export interface WorkflowRunRepository {
  load(runId: string): Promise<PersistedRunState | undefined>;

  save(state: PersistedRunState): Promise<void>;

  listRuns(args: Readonly<{ workflowId?: string; limit?: number }>): Promise<ReadonlyArray<RunSummary>>;
}
