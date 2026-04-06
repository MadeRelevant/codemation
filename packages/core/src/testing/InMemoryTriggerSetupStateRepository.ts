import type { PersistedTriggerSetupState, TriggerSetupStateRepository } from "../types";

export class InMemoryTriggerSetupStateRepository implements TriggerSetupStateRepository {
  private readonly statesByKey = new Map<string, PersistedTriggerSetupState>();

  async load(trigger: { workflowId: string; nodeId: string }): Promise<PersistedTriggerSetupState | undefined> {
    return this.statesByKey.get(this.toKey(trigger));
  }

  async save(state: PersistedTriggerSetupState): Promise<void> {
    this.statesByKey.set(this.toKey(state.trigger), state);
  }

  async delete(trigger: { workflowId: string; nodeId: string }): Promise<void> {
    this.statesByKey.delete(this.toKey(trigger));
  }

  private toKey(trigger: { workflowId: string; nodeId: string }): string {
    return `${trigger.workflowId}:${trigger.nodeId}`;
  }
}
