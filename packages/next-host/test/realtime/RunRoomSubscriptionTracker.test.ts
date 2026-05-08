import { describe, it, expect, vi, beforeEach } from "vitest";
import { RunRoomSubscriptionTracker } from "../../src/features/workflows/lib/realtime/RunRoomSubscriptionTracker";
import type { RunRoomSubscriptionTrackerCallbacks } from "../../src/features/workflows/lib/realtime/RunRoomSubscriptionTracker";

function makeCallbacks(): RunRoomSubscriptionTrackerCallbacks & {
  activated: string[];
  deactivated: string[];
} {
  const activated: string[] = [];
  const deactivated: string[] = [];
  return {
    activated,
    deactivated,
    onRoomActivated: vi.fn((runId: string) => {
      activated.push(runId);
    }),
    onRoomDeactivated: vi.fn((runId: string) => {
      deactivated.push(runId);
    }),
  };
}

describe("RunRoomSubscriptionTracker", () => {
  let callbacks: ReturnType<typeof makeCallbacks>;
  let tracker: RunRoomSubscriptionTracker;

  beforeEach(() => {
    callbacks = makeCallbacks();
    tracker = new RunRoomSubscriptionTracker(callbacks);
  });

  it("fires onRoomActivated on first retain (0→1 transition)", () => {
    const result = tracker.retain("run-a");

    expect(result.transitionedToActive).toBe(true);
    expect(callbacks.onRoomActivated).toHaveBeenCalledOnce();
    expect(callbacks.onRoomActivated).toHaveBeenCalledWith("run-a");
    expect(callbacks.onRoomDeactivated).not.toHaveBeenCalled();
  });

  it("does NOT fire onRoomActivated on second retain (1→2)", () => {
    tracker.retain("run-a");
    vi.clearAllMocks();

    const result = tracker.retain("run-a");

    expect(result.transitionedToActive).toBe(false);
    expect(callbacks.onRoomActivated).not.toHaveBeenCalled();
  });

  it("retain twice / release once → still active (count=1), onRoomDeactivated not fired", () => {
    tracker.retain("run-a");
    tracker.retain("run-a");

    const result = tracker.release("run-a");

    expect(result.transitionedToInactive).toBe(false);
    expect(result.remaining).toBe(1);
    expect(tracker.activeRunIds()).toContain("run-a");
    expect(callbacks.onRoomDeactivated).not.toHaveBeenCalled();
  });

  it("release after two retains fully → inactive, onRoomDeactivated fired", () => {
    tracker.retain("run-a");
    tracker.retain("run-a");
    tracker.release("run-a");

    const result = tracker.release("run-a");

    expect(result.transitionedToInactive).toBe(true);
    expect(result.remaining).toBe(0);
    expect(tracker.activeRunIds()).not.toContain("run-a");
    expect(callbacks.onRoomDeactivated).toHaveBeenCalledOnce();
    expect(callbacks.onRoomDeactivated).toHaveBeenCalledWith("run-a");
  });

  it("multiple distinct runIds are tracked independently", () => {
    tracker.retain("run-a");
    tracker.retain("run-b");
    tracker.retain("run-a");

    expect(tracker.activeRunIds()).toContain("run-a");
    expect(tracker.activeRunIds()).toContain("run-b");

    tracker.release("run-b");

    expect(tracker.activeRunIds()).not.toContain("run-b");
    expect(tracker.activeRunIds()).toContain("run-a");
    expect(callbacks.onRoomDeactivated).toHaveBeenCalledWith("run-b");
  });

  it("activeRunIds() returns only currently active ids", () => {
    tracker.retain("run-a");
    tracker.retain("run-b");
    tracker.retain("run-c");
    tracker.release("run-b");

    const ids = tracker.activeRunIds();
    expect(ids).toContain("run-a");
    expect(ids).not.toContain("run-b");
    expect(ids).toContain("run-c");
    expect(ids).toHaveLength(2);
  });

  it("releasing a runId with no existing count does not fire onRoomDeactivated", () => {
    const result = tracker.release("nonexistent");

    expect(result.transitionedToInactive).toBe(false);
    expect(result.remaining).toBe(0);
    expect(callbacks.onRoomDeactivated).not.toHaveBeenCalled();
  });

  it("activeRunIds() is empty when tracker has no active rooms", () => {
    expect(tracker.activeRunIds()).toHaveLength(0);

    tracker.retain("run-a");
    tracker.release("run-a");

    expect(tracker.activeRunIds()).toHaveLength(0);
  });

  it("retaining after full release treats the room as new (0→1 fires onRoomActivated again)", () => {
    tracker.retain("run-a");
    tracker.release("run-a");
    vi.clearAllMocks();

    const result = tracker.retain("run-a");

    expect(result.transitionedToActive).toBe(true);
    expect(callbacks.onRoomActivated).toHaveBeenCalledWith("run-a");
  });
});
