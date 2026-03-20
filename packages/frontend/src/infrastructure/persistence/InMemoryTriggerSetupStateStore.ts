import type { PersistedTriggerSetupState,TriggerInstanceId,TriggerSetupStateStore } from "@codemation/core";
import { injectable } from "@codemation/core";

@injectable()
export class InMemoryTriggerSetupStateStore implements TriggerSetupStateStore {
  private readonly statesByKey = new Map<string, PersistedTriggerSetupState>();

  async load(trigger: TriggerInstanceId): Promise<PersistedTriggerSetupState | undefined> {
    return this.statesByKey.get(this.toKey(trigger));
  }

  async save(state: PersistedTriggerSetupState): Promise<void> {
    this.statesByKey.set(this.toKey(state.trigger), state);
  }

  async delete(trigger: TriggerInstanceId): Promise<void> {
    this.statesByKey.delete(this.toKey(trigger));
  }

  private toKey(trigger: TriggerInstanceId): string {
    return `${trigger.workflowId}:${trigger.nodeId}`;
  }
}
