import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PageVisibilityIdleTimer } from "../../src/features/workflows/lib/realtime/PageVisibilityIdleTimer";
import type {
  PageVisibilityIdleTimerDocumentRef,
  PageVisibilityIdleTimerWindowRef,
} from "../../src/features/workflows/lib/realtime/PageVisibilityIdleTimer";

type VisibilityState = DocumentVisibilityState;

function makeDocumentRef(initial: VisibilityState = "visible"): PageVisibilityIdleTimerDocumentRef & {
  triggerVisibilityChange(state: VisibilityState): void;
} {
  let state = initial;
  const listeners: Array<() => void> = [];

  return {
    get visibilityState(): VisibilityState {
      return state;
    },
    addEventListener(_type: "visibilitychange", listener: () => void) {
      listeners.push(listener);
    },
    removeEventListener(_type: "visibilitychange", listener: () => void) {
      const idx = listeners.indexOf(listener);
      if (idx !== -1) listeners.splice(idx, 1);
    },
    triggerVisibilityChange(newState: VisibilityState) {
      state = newState;
      for (const l of listeners) l();
    },
  };
}

function makeWindowRef(): PageVisibilityIdleTimerWindowRef {
  return {
    setTimeout: (handler: () => void, ms: number) => globalThis.setTimeout(handler, ms) as unknown as number,
    clearTimeout: (id: number) => globalThis.clearTimeout(id),
  };
}

const IDLE_MS = 5000;

describe("PageVisibilityIdleTimer", () => {
  let onIdle: ReturnType<typeof vi.fn>;
  let onActive: ReturnType<typeof vi.fn>;
  let docRef: ReturnType<typeof makeDocumentRef>;
  let winRef: PageVisibilityIdleTimerWindowRef;
  let timer: PageVisibilityIdleTimer;

  beforeEach(() => {
    vi.useFakeTimers();
    onIdle = vi.fn();
    onActive = vi.fn();
    docRef = makeDocumentRef("visible");
    winRef = makeWindowRef();
    timer = new PageVisibilityIdleTimer({
      documentRef: docRef,
      windowRef: winRef,
      idleMs: IDLE_MS,
      onIdle,
      onActive,
    });
  });

  afterEach(() => {
    timer.stop();
    vi.useRealTimers();
  });

  it("constructor does not schedule anything until start() is called", () => {
    docRef.triggerVisibilityChange("hidden");
    vi.advanceTimersByTime(IDLE_MS + 1);

    expect(onIdle).not.toHaveBeenCalled();
    expect(onActive).not.toHaveBeenCalled();
  });

  it("hidden → idle fires after idleMs", () => {
    timer.start();
    docRef.triggerVisibilityChange("hidden");

    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(onIdle).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onIdle).toHaveBeenCalledOnce();
    expect(onActive).not.toHaveBeenCalled();
  });

  it("hidden → visible before idleMs → timer cleared, onIdle never fires", () => {
    timer.start();
    docRef.triggerVisibilityChange("hidden");
    vi.advanceTimersByTime(IDLE_MS - 1);

    docRef.triggerVisibilityChange("visible");
    vi.advanceTimersByTime(IDLE_MS);

    expect(onIdle).not.toHaveBeenCalled();
    expect(onActive).not.toHaveBeenCalled();
  });

  it("visible → hidden → visible (no idle in between) → neither callback fires", () => {
    timer.start();
    // Tab starts visible; hide then show before timer elapses.
    docRef.triggerVisibilityChange("hidden");
    vi.advanceTimersByTime(IDLE_MS / 2);
    docRef.triggerVisibilityChange("visible");

    // Advance past where idle would have fired.
    vi.advanceTimersByTime(IDLE_MS);

    expect(onIdle).not.toHaveBeenCalled();
    expect(onActive).not.toHaveBeenCalled();
  });

  it("hidden → idle fires → visible → onActive fires", () => {
    timer.start();
    docRef.triggerVisibilityChange("hidden");
    vi.advanceTimersByTime(IDLE_MS);
    expect(onIdle).toHaveBeenCalledOnce();

    docRef.triggerVisibilityChange("visible");
    expect(onActive).toHaveBeenCalledOnce();
  });

  it("stop() clears timer and removes listeners so no callbacks fire", () => {
    timer.start();
    docRef.triggerVisibilityChange("hidden");
    vi.advanceTimersByTime(IDLE_MS / 2);

    timer.stop();
    vi.advanceTimersByTime(IDLE_MS);

    expect(onIdle).not.toHaveBeenCalled();
    // Simulate a visibility event after stop — should be ignored (listener removed).
    docRef.triggerVisibilityChange("visible");
    expect(onActive).not.toHaveBeenCalled();
  });

  it("onActive fires only once per idle cycle (second show after already active does nothing)", () => {
    timer.start();
    docRef.triggerVisibilityChange("hidden");
    vi.advanceTimersByTime(IDLE_MS);

    docRef.triggerVisibilityChange("visible");
    expect(onActive).toHaveBeenCalledOnce();

    // Another visibility toggle without going idle again — onActive not fired again.
    docRef.triggerVisibilityChange("hidden");
    docRef.triggerVisibilityChange("visible");
    expect(onActive).toHaveBeenCalledOnce();
  });

  it("calling start() twice is a no-op — listeners not duplicated", () => {
    timer.start();
    timer.start(); // second call should be ignored

    docRef.triggerVisibilityChange("hidden");
    vi.advanceTimersByTime(IDLE_MS);

    // Should fire exactly once, not twice.
    expect(onIdle).toHaveBeenCalledOnce();
  });

  it("visible event when no idle timer is pending and idle never fired → neither callback fires", () => {
    timer.start();
    // Tab is already visible (never hidden); trigger visible change directly.
    docRef.triggerVisibilityChange("visible");

    expect(onIdle).not.toHaveBeenCalled();
    expect(onActive).not.toHaveBeenCalled();
  });
});
