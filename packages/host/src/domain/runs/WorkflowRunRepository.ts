import type { PersistedRunState, RunId, RunPruneCandidate, RunSummary, WorkflowRunDetailDto } from "@codemation/core";

export interface WorkflowRunRepository {
  load(runId: string): Promise<PersistedRunState | undefined>;

  loadRunDetail?(runId: string): Promise<WorkflowRunDetailDto | undefined>;

  save(state: PersistedRunState): Promise<void>;

  listRuns(args: Readonly<{ workflowId?: string; limit?: number }>): Promise<ReadonlyArray<RunSummary>>;

  listRunsOlderThan?(
    args: Readonly<{ nowIso: string; defaultRetentionSeconds: number; limit?: number }>,
  ): Promise<ReadonlyArray<RunPruneCandidate>>;

  listBinaryStorageKeys?(runId: RunId): Promise<ReadonlyArray<string>>;

  deleteRun(runId: RunId): Promise<void>;
}
