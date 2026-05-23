/** Minimal subset of `Document` needed by `PageVisibilityIdleTimer`. */
export interface PageVisibilityIdleTimerDocumentRef {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/** Minimal subset of `Window` needed by `PageVisibilityIdleTimer`. */
export interface PageVisibilityIdleTimerWindowRef {
  setTimeout(handler: () => void, ms: number): number;
  clearTimeout(id: number): void;
}

export interface PageVisibilityIdleTimerArgs {
  documentRef: PageVisibilityIdleTimerDocumentRef;
  windowRef: PageVisibilityIdleTimerWindowRef;
  /** Duration in ms the tab must be hidden before `onIdle` fires. */
  idleMs: number;
  /** Called once when the hidden idle timeout elapses. */
  onIdle: () => void;
  /**
   * Called when the tab becomes visible again AFTER `onIdle` has already fired.
   * Not called for a hide→show transition that occurs before `idleMs` elapses.
   */
  onActive: () => void;
}

/**
 * Fires `onIdle` after the tab has been hidden for `idleMs`, then fires `onActive` the
 * next time the tab becomes visible again.  The callbacks are level-triggered: one idle
 * cycle = one `onIdle` + one `onActive`.
 *
 * `start()` attaches the `visibilitychange` listener; `stop()` removes it and cancels
 * any pending timer.  Neither callback is invoked before `start()` or after `stop()`.
 */
export class PageVisibilityIdleTimer {
  private readonly args: PageVisibilityIdleTimerArgs;
  private pendingIdleTimeoutId: number | null = null;
  private hasFiredIdle = false;
  private started = false;

  constructor(args: PageVisibilityIdleTimerArgs) {
    this.args = args;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.args.documentRef.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    this.args.documentRef.removeEventListener("visibilitychange", this.handleVisibilityChange);
    if (this.pendingIdleTimeoutId !== null) {
      this.args.windowRef.clearTimeout(this.pendingIdleTimeoutId);
      this.pendingIdleTimeoutId = null;
    }
    this.hasFiredIdle = false;
  }

  private readonly handleVisibilityChange = (): void => {
    if (this.args.documentRef.visibilityState === "hidden") {
      // Start the idle countdown.
      this.pendingIdleTimeoutId = this.args.windowRef.setTimeout(() => {
        this.pendingIdleTimeoutId = null;
        this.hasFiredIdle = true;
        this.args.onIdle();
      }, this.args.idleMs);
    } else {
      // Tab became visible.
      if (this.pendingIdleTimeoutId !== null) {
        // Idle hasn't fired yet — cancel and do nothing.
        this.args.windowRef.clearTimeout(this.pendingIdleTimeoutId);
        this.pendingIdleTimeoutId = null;
      } else if (this.hasFiredIdle) {
        // Idle already fired — notify active and reset.
        this.hasFiredIdle = false;
        this.args.onActive();
      }
    }
  };
}
