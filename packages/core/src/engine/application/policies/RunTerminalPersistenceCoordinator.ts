import type { PersistedRunState, RunStateStore, WorkflowDefinition } from "../../../types";

import { WorkflowStoragePolicyEvaluator } from "./WorkflowStoragePolicyEvaluator";

export class RunTerminalPersistenceCoordinator {
  constructor(
    private readonly runStore: RunStateStore,
    private readonly storageEvaluator: WorkflowStoragePolicyEvaluator,
  ) {}

  async maybeDeleteAfterTerminalState(args: {
    workflow: WorkflowDefinition;
    state: PersistedRunState;
    finalStatus: "completed" | "failed";
    finishedAt: string;
  }): Promise<void> {
    const persist = await this.storageEvaluator.shouldPersist(args.workflow, args.state.policySnapshot, {
      runId: args.state.runId,
      workflowId: args.state.workflowId,
      workflow: args.workflow,
      finalStatus: args.finalStatus,
      startedAt: args.state.startedAt,
      finishedAt: args.finishedAt,
    });
    if (persist) return;
    if (!this.runStore.deleteRun) return;
    await this.runStore.deleteRun(args.state.runId);
  }
}
