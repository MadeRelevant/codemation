/** Notification callbacks fired when a run room transitions in/out of active state. */
export interface RunRoomSubscriptionTrackerCallbacks {
  /** Called when a runId transitions from 0 → 1 subscribers (room should be subscribed). */
  onRoomActivated(runId: string): void;
  /** Called when a runId transitions from 1 → 0 subscribers (room should be unsubscribed). */
  onRoomDeactivated(runId: string): void;
}

/**
 * Ref-counted tracker for `run:<runId>` room subscriptions.
 *
 * `retain(runId)` increments the count; transitions 0→1 fire `onRoomActivated`.
 * `release(runId)` decrements the count; transitions 1→0 fire `onRoomDeactivated`.
 * Counts never go below zero.
 */
export class RunRoomSubscriptionTracker {
  private readonly counts = new Map<string, number>();
  private readonly callbacks: RunRoomSubscriptionTrackerCallbacks;

  constructor(callbacks: RunRoomSubscriptionTrackerCallbacks) {
    this.callbacks = callbacks;
  }

  /** Increment subscriber count for `runId`. Returns whether the room just became active. */
  retain(runId: string): { transitionedToActive: boolean } {
    const prev = this.counts.get(runId) ?? 0;
    this.counts.set(runId, prev + 1);
    const transitionedToActive = prev === 0;
    if (transitionedToActive) {
      this.callbacks.onRoomActivated(runId);
    }
    return { transitionedToActive };
  }

  /** Decrement subscriber count for `runId`. Returns whether the room just became inactive and
   *  how many subscribers remain. */
  release(runId: string): { transitionedToInactive: boolean; remaining: number } {
    const prev = this.counts.get(runId) ?? 0;
    if (prev <= 1) {
      this.counts.delete(runId);
      if (prev === 1) {
        this.callbacks.onRoomDeactivated(runId);
      }
      return { transitionedToInactive: prev === 1, remaining: 0 };
    }
    const remaining = prev - 1;
    this.counts.set(runId, remaining);
    return { transitionedToInactive: false, remaining };
  }

  /** Returns the currently active runIds (those with count > 0), in insertion order. */
  activeRunIds(): readonly string[] {
    return Array.from(this.counts.keys());
  }
}
