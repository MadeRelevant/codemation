import { RunFinishedAtFactory } from "../contracts/runFinishedAtFactory";
import type { PersistedRunState, RunSummary } from "../types";

/** Maps persisted run state to API run summaries for listings. */
export class RunSummaryMapper {
  static fromPersistedState(state: PersistedRunState): RunSummary {
    return {
      runId: state.runId,
      workflowId: state.workflowId,
      startedAt: state.startedAt,
      status: state.status,
      finishedAt: RunFinishedAtFactory.resolveIso(state),
      parent: state.parent,
      executionOptions: state.executionOptions,
    };
  }
}
