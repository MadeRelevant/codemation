import type { WorkflowId } from "../types";

import type { RunEvent, RunEventBus, RunEventSubscription } from "./runEvents";

import { InMemoryRunEventSubscription } from "./InMemoryRunEventSubscription";

export class InMemoryRunEventBus implements RunEventBus {
  private readonly globalListeners = new Set<(event: RunEvent) => void>();
  private readonly listenersByWorkflowId = new Map<WorkflowId, Set<(event: RunEvent) => void>>();

  async publish(event: RunEvent): Promise<void> {
    for (const listener of this.globalListeners) listener(event);
    for (const listener of this.listenersByWorkflowId.get(event.workflowId) ?? []) listener(event);
  }

  async subscribe(onEvent: (event: RunEvent) => void): Promise<RunEventSubscription> {
    this.globalListeners.add(onEvent);
    return new InMemoryRunEventSubscription(() => {
      this.globalListeners.delete(onEvent);
    });
  }

  async subscribeToWorkflow(workflowId: WorkflowId, onEvent: (event: RunEvent) => void): Promise<RunEventSubscription> {
    const existing = this.listenersByWorkflowId.get(workflowId) ?? new Set<(event: RunEvent) => void>();
    existing.add(onEvent);
    this.listenersByWorkflowId.set(workflowId, existing);

    return new InMemoryRunEventSubscription(() => {
      const listeners = this.listenersByWorkflowId.get(workflowId);
      if (!listeners) return;
      listeners.delete(onEvent);
      if (listeners.size === 0) this.listenersByWorkflowId.delete(workflowId);
    });
  }
}

export { InMemoryRunEventSubscription } from "./InMemoryRunEventSubscription";
