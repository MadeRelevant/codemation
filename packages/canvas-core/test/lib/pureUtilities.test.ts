/**
 * Tests for pure utility classes in canvas-core lib and realtime modules.
 * Covers: HumanFriendlyTimestampFormatter, WorkflowQueryRetryPolicy,
 * WorkflowDetailUrlCodec, WorkflowActivationHttpErrorFormat,
 * RunRoomSubscriptionTracker, PageVisibilityIdleTimer, realtimeQueryKeys.
 */
import { describe, expect, test } from "vitest";

import { HumanFriendlyTimestampFormatter } from "../../src/lib/HumanFriendlyTimestampFormatter";
import { CodemationApiHttpError } from "../../src/lib/CodemationApiHttpError";
import { WorkflowQueryRetryPolicy } from "../../src/realtime/WorkflowQueryRetryPolicy";
import { WorkflowDetailUrlCodec } from "../../src/lib/workflowDetail/WorkflowDetailUrlCodec";
import { WorkflowActivationHttpErrorFormat } from "../../src/lib/workflowDetail/WorkflowActivationHttpErrorFormat";
import { RunRoomSubscriptionTracker } from "../../src/realtime/RunRoomSubscriptionTracker";
import { PageVisibilityIdleTimer } from "../../src/realtime/PageVisibilityIdleTimer";
import {
  workflowQueryKey,
  workflowRunsQueryKey,
  workflowDebuggerOverlayQueryKey,
  workflowDevBuildStateQueryKey,
  runQueryKey,
  runDetailQueryKey,
  telemetryRunTraceQueryKey,
  workflowCredentialHealthQueryKey,
  workflowTestSuiteRunsQueryKey,
  testSuiteRunDetailQueryKey,
  testSuiteRunAssertionsQueryKey,
  testSuiteRunChildRunsQueryKey,
  runAssertionsQueryKey,
  assertionMetricTrendsQueryKey,
} from "../../src/realtime/realtimeQueryKeys";

// ── CodemationApiHttpError ─────────────────────────────────────────────────────

describe("CodemationApiHttpError", () => {
  test("sets name, status, bodyText", () => {
    const err = new CodemationApiHttpError(404, "Not found");
    expect(err.name).toBe("CodemationApiHttpError");
    expect(err.status).toBe(404);
    expect(err.bodyText).toBe("Not found");
    expect(err.message).toBe("HTTP 404: Not found");
  });

  test("message is just HTTP <status> when body is empty", () => {
    const err = new CodemationApiHttpError(500, "");
    expect(err.message).toBe("HTTP 500");
  });

  test("trims whitespace from bodyText for the message", () => {
    const err = new CodemationApiHttpError(400, "  Bad request  ");
    expect(err.message).toBe("HTTP 400: Bad request");
  });
});

// ── HumanFriendlyTimestampFormatter ───────────────────────────────────────────

describe("HumanFriendlyTimestampFormatter.formatRunListWhen", () => {
  test("returns em-dash for undefined", () => {
    expect(HumanFriendlyTimestampFormatter.formatRunListWhen(undefined)).toBe("—");
  });

  test("returns em-dash for empty string", () => {
    expect(HumanFriendlyTimestampFormatter.formatRunListWhen("")).toBe("—");
  });

  test("returns em-dash for invalid date string", () => {
    expect(HumanFriendlyTimestampFormatter.formatRunListWhen("not-a-date")).toBe("—");
  });

  test("returns 'Today · HH:mm' for a today timestamp", () => {
    const now = new Date();
    const result = HumanFriendlyTimestampFormatter.formatRunListWhen(now.toISOString());
    expect(result.startsWith("Today · ")).toBe(true);
  });

  test("returns 'Yesterday · HH:mm' for a yesterday timestamp", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const result = HumanFriendlyTimestampFormatter.formatRunListWhen(yesterday.toISOString());
    expect(result.startsWith("Yesterday · ")).toBe(true);
  });

  test("returns formatted date string for older dates", () => {
    // A known past date well before yesterday
    const pastDate = "2020-06-15T10:30:00.000Z";
    const result = HumanFriendlyTimestampFormatter.formatRunListWhen(pastDate);
    // Should contain year, month, time segment (exact format depends on locale/TZ but contains known parts)
    expect(result).toContain("2020");
    expect(result).toContain("·");
  });
});

// ── WorkflowQueryRetryPolicy ───────────────────────────────────────────────────

describe("WorkflowQueryRetryPolicy.shouldRetry", () => {
  test("returns false for 404 CodemationApiHttpError regardless of count", () => {
    const err = new CodemationApiHttpError(404, "Not found");
    expect(WorkflowQueryRetryPolicy.shouldRetry(0, err)).toBe(false);
    expect(WorkflowQueryRetryPolicy.shouldRetry(2, err)).toBe(false);
  });

  test("returns true for non-404 CodemationApiHttpError when failureCount < 3", () => {
    const err = new CodemationApiHttpError(500, "Server error");
    expect(WorkflowQueryRetryPolicy.shouldRetry(0, err)).toBe(true);
    expect(WorkflowQueryRetryPolicy.shouldRetry(2, err)).toBe(true);
  });

  test("returns false for non-404 error when failureCount >= 3", () => {
    const err = new CodemationApiHttpError(500, "Server error");
    expect(WorkflowQueryRetryPolicy.shouldRetry(3, err)).toBe(false);
    expect(WorkflowQueryRetryPolicy.shouldRetry(10, err)).toBe(false);
  });

  test("returns true for non-HTTP error when failureCount < 3", () => {
    expect(WorkflowQueryRetryPolicy.shouldRetry(1, new Error("network error"))).toBe(true);
  });

  test("returns false for non-HTTP error when failureCount >= 3", () => {
    expect(WorkflowQueryRetryPolicy.shouldRetry(3, new Error("network error"))).toBe(false);
  });
});

// ── WorkflowDetailUrlCodec ─────────────────────────────────────────────────────

class FakeSearchParams {
  private readonly params: Record<string, string>;
  constructor(params: Record<string, string>) {
    this.params = params;
  }
  get(name: string): string | null {
    return this.params[name] ?? null;
  }
  toString(): string {
    return new URLSearchParams(this.params).toString();
  }
}

describe("WorkflowDetailUrlCodec.parseSearchParams", () => {
  test("returns null values when no params present", () => {
    const result = WorkflowDetailUrlCodec.parseSearchParams(new FakeSearchParams({}));
    expect(result.selectedRunId).toBeNull();
    expect(result.isRunsPaneVisible).toBe(false);
    expect(result.nodeId).toBeNull();
  });

  test("parses run param into selectedRunId", () => {
    const result = WorkflowDetailUrlCodec.parseSearchParams(new FakeSearchParams({ run: "run-123" }));
    expect(result.selectedRunId).toBe("run-123");
    expect(result.isRunsPaneVisible).toBe(true);
  });

  test("isRunsPaneVisible is true when pane=executions", () => {
    const result = WorkflowDetailUrlCodec.parseSearchParams(new FakeSearchParams({ pane: "executions" }));
    expect(result.selectedRunId).toBeNull();
    expect(result.isRunsPaneVisible).toBe(true);
  });

  test("pane=live does not make isRunsPaneVisible true", () => {
    const result = WorkflowDetailUrlCodec.parseSearchParams(new FakeSearchParams({ pane: "live" }));
    expect(result.isRunsPaneVisible).toBe(false);
  });

  test("parses node param into nodeId", () => {
    const result = WorkflowDetailUrlCodec.parseSearchParams(new FakeSearchParams({ node: "node-abc" }));
    expect(result.nodeId).toBe("node-abc");
  });

  test("trims whitespace from run param", () => {
    const result = WorkflowDetailUrlCodec.parseSearchParams(new FakeSearchParams({ run: "  run-123  " }));
    expect(result.selectedRunId).toBe("run-123");
  });

  test("returns null for empty run param", () => {
    const result = WorkflowDetailUrlCodec.parseSearchParams(new FakeSearchParams({ run: "  " }));
    expect(result.selectedRunId).toBeNull();
  });
});

describe("WorkflowDetailUrlCodec.mergeLocationIntoSearchParams", () => {
  test("sets run param when selectedRunId is set", () => {
    const result = WorkflowDetailUrlCodec.mergeLocationIntoSearchParams(new URLSearchParams(), {
      selectedRunId: "run-999",
      isRunsPaneVisible: true,
      nodeId: null,
    });
    expect(result.get("run")).toBe("run-999");
    expect(result.get("pane")).toBeNull();
  });

  test("sets pane=executions when isRunsPaneVisible and no selectedRunId", () => {
    const result = WorkflowDetailUrlCodec.mergeLocationIntoSearchParams(new URLSearchParams(), {
      selectedRunId: null,
      isRunsPaneVisible: true,
      nodeId: null,
    });
    expect(result.get("pane")).toBe("executions");
    expect(result.get("run")).toBeNull();
  });

  test("sets node param when nodeId is set", () => {
    const result = WorkflowDetailUrlCodec.mergeLocationIntoSearchParams(new URLSearchParams(), {
      selectedRunId: null,
      isRunsPaneVisible: false,
      nodeId: "node-xyz",
    });
    expect(result.get("node")).toBe("node-xyz");
  });

  test("removes existing run/pane/node params from base", () => {
    const base = new URLSearchParams("run=old&pane=executions&node=old-node");
    const result = WorkflowDetailUrlCodec.mergeLocationIntoSearchParams(base, {
      selectedRunId: null,
      isRunsPaneVisible: false,
      nodeId: null,
    });
    expect(result.get("run")).toBeNull();
    expect(result.get("pane")).toBeNull();
    expect(result.get("node")).toBeNull();
  });

  test("preserves unrelated params", () => {
    const base = new URLSearchParams("filter=active");
    const result = WorkflowDetailUrlCodec.mergeLocationIntoSearchParams(base, {
      selectedRunId: "run-1",
      isRunsPaneVisible: true,
      nodeId: null,
    });
    expect(result.get("filter")).toBe("active");
    expect(result.get("run")).toBe("run-1");
  });
});

describe("WorkflowDetailUrlCodec.buildHref", () => {
  test("returns pathname with no query string when no params set", () => {
    const href = WorkflowDetailUrlCodec.buildHref("/workflow/123", new FakeSearchParams({}), {
      selectedRunId: null,
      isRunsPaneVisible: false,
      nodeId: null,
    });
    expect(href).toBe("/workflow/123");
  });

  test("returns pathname with query string when params are set", () => {
    const href = WorkflowDetailUrlCodec.buildHref("/workflow/123", new FakeSearchParams({}), {
      selectedRunId: "run-1",
      isRunsPaneVisible: true,
      nodeId: "node-a",
    });
    expect(href).toContain("/workflow/123?");
    expect(href).toContain("run=run-1");
    expect(href).toContain("node=node-a");
  });
});

// ── WorkflowActivationHttpErrorFormat ─────────────────────────────────────────

describe("WorkflowActivationHttpErrorFormat.extractMessages", () => {
  const formatter = new WorkflowActivationHttpErrorFormat();

  test("returns array with error.message for generic Error", () => {
    const msgs = formatter.extractMessages(new Error("something failed"));
    expect(msgs).toEqual(["something failed"]);
  });

  test("returns stringified value for non-Error primitives", () => {
    const msgs = formatter.extractMessages("raw string error");
    expect(msgs).toEqual(["raw string error"]);
  });

  test("returns errors array from JSON body when present", () => {
    const err = new CodemationApiHttpError(422, JSON.stringify({ errors: ["field required", "invalid value"] }));
    const msgs = formatter.extractMessages(err);
    expect(msgs).toEqual(["field required", "invalid value"]);
  });

  test("returns single error from JSON body when errors array absent", () => {
    const err = new CodemationApiHttpError(400, JSON.stringify({ error: "bad request" }));
    const msgs = formatter.extractMessages(err);
    expect(msgs).toEqual(["bad request"]);
  });

  test("falls back to error.message when body is not valid JSON", () => {
    const err = new CodemationApiHttpError(500, "Internal Server Error");
    const msgs = formatter.extractMessages(err);
    expect(msgs).toEqual(["HTTP 500: Internal Server Error"]);
  });

  test("falls back to error.message when JSON body has no errors/error", () => {
    const err = new CodemationApiHttpError(400, JSON.stringify({ something: "else" }));
    const msgs = formatter.extractMessages(err);
    expect(msgs).toEqual(['HTTP 400: {"something":"else"}']);
  });

  test("falls back to error.message when body is empty JSON object", () => {
    const err = new CodemationApiHttpError(400, "{}");
    const msgs = formatter.extractMessages(err);
    expect(msgs).toEqual(["HTTP 400: {}"]);
  });
});

// ── RunRoomSubscriptionTracker ─────────────────────────────────────────────────

describe("RunRoomSubscriptionTracker", () => {
  function makeTracker() {
    const activated: string[] = [];
    const deactivated: string[] = [];
    const tracker = new RunRoomSubscriptionTracker({
      onRoomActivated: (id) => activated.push(id),
      onRoomDeactivated: (id) => deactivated.push(id),
    });
    return { tracker, activated, deactivated };
  }

  test("retain fires onRoomActivated on first retain", () => {
    const { tracker, activated } = makeTracker();
    const { transitionedToActive } = tracker.retain("run-1");
    expect(transitionedToActive).toBe(true);
    expect(activated).toEqual(["run-1"]);
  });

  test("retain does not fire onRoomActivated on second retain", () => {
    const { tracker, activated } = makeTracker();
    tracker.retain("run-1");
    const { transitionedToActive } = tracker.retain("run-1");
    expect(transitionedToActive).toBe(false);
    expect(activated).toEqual(["run-1"]);
  });

  test("release fires onRoomDeactivated when count reaches 0", () => {
    const { tracker, deactivated } = makeTracker();
    tracker.retain("run-1");
    const result = tracker.release("run-1");
    expect(result.transitionedToInactive).toBe(true);
    expect(result.remaining).toBe(0);
    expect(deactivated).toEqual(["run-1"]);
  });

  test("release with count > 1 decrements without deactivating", () => {
    const { tracker, deactivated } = makeTracker();
    tracker.retain("run-1");
    tracker.retain("run-1");
    const result = tracker.release("run-1");
    expect(result.transitionedToInactive).toBe(false);
    expect(result.remaining).toBe(1);
    expect(deactivated).toEqual([]);
  });

  test("release with count 0 (never retained) does not fire callback", () => {
    const { tracker, deactivated } = makeTracker();
    const result = tracker.release("run-1");
    expect(result.transitionedToInactive).toBe(false);
    expect(result.remaining).toBe(0);
    expect(deactivated).toEqual([]);
  });

  test("activeRunIds returns retained runIds", () => {
    const { tracker } = makeTracker();
    tracker.retain("run-a");
    tracker.retain("run-b");
    expect(tracker.activeRunIds()).toEqual(["run-a", "run-b"]);
  });

  test("activeRunIds excludes released runIds", () => {
    const { tracker } = makeTracker();
    tracker.retain("run-a");
    tracker.retain("run-b");
    tracker.release("run-a");
    expect(tracker.activeRunIds()).toEqual(["run-b"]);
  });
});

// ── PageVisibilityIdleTimer ────────────────────────────────────────────────────

describe("PageVisibilityIdleTimer", () => {
  function makeTimer(idleMs = 1000) {
    const listeners: Array<() => void> = [];
    let visibilityState: DocumentVisibilityState = "visible";
    let lastTimeoutId = 0;
    const pendingTimeouts = new Map<number, () => void>();
    const idleCallbacks: Array<() => void> = [];
    const activeCallbacks: Array<() => void> = [];

    const documentRef = {
      get visibilityState(): DocumentVisibilityState {
        return visibilityState;
      },
      addEventListener(_type: "visibilitychange", listener: () => void) {
        listeners.push(listener);
      },
      removeEventListener(_type: "visibilitychange", listener: () => void) {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    };

    const windowRef = {
      setTimeout(handler: () => void, _ms: number): number {
        lastTimeoutId += 1;
        pendingTimeouts.set(lastTimeoutId, handler);
        return lastTimeoutId;
      },
      clearTimeout(id: number): void {
        pendingTimeouts.delete(id);
      },
    };

    function simulateHide() {
      visibilityState = "hidden";
      for (const l of listeners) l();
    }

    function simulateShow() {
      visibilityState = "visible";
      for (const l of listeners) l();
    }

    function flushTimeout(id: number) {
      const handler = pendingTimeouts.get(id);
      if (handler) {
        pendingTimeouts.delete(id);
        handler();
      }
    }

    function flushAllTimeouts() {
      for (const [id, handler] of pendingTimeouts) {
        pendingTimeouts.delete(id);
        handler();
      }
    }

    const timer = new PageVisibilityIdleTimer({
      documentRef,
      windowRef,
      idleMs,
      onIdle: () => idleCallbacks.push(() => {}),
      onActive: () => activeCallbacks.push(() => {}),
    });

    return {
      timer,
      get currentTimeoutId() {
        return lastTimeoutId;
      },
      simulateHide,
      simulateShow,
      flushTimeout,
      flushAllTimeouts,
      idleCallbacks,
      activeCallbacks,
      pendingTimeouts,
    };
  }

  test("start attaches visibilitychange listener", () => {
    const { timer, simulateHide, idleCallbacks, flushAllTimeouts } = makeTimer();
    timer.start();
    simulateHide();
    flushAllTimeouts();
    expect(idleCallbacks.length).toBe(1);
  });

  test("stop removes listener and cancels pending timeout", () => {
    const { timer, simulateHide, simulateShow, idleCallbacks, activeCallbacks } = makeTimer();
    timer.start();
    simulateHide(); // schedules idle timeout
    timer.stop(); // should cancel timeout
    // No timeouts fire because stop cancelled them
    expect(idleCallbacks.length).toBe(0);
    simulateShow(); // listener removed, nothing happens
    expect(activeCallbacks.length).toBe(0);
  });

  test("start is idempotent — second call has no effect", () => {
    const { timer, simulateHide, idleCallbacks, flushAllTimeouts } = makeTimer();
    timer.start();
    timer.start(); // no-op
    simulateHide();
    flushAllTimeouts();
    expect(idleCallbacks.length).toBe(1);
  });

  test("stop is idempotent — calling before start does nothing", () => {
    const { timer } = makeTimer();
    expect(() => timer.stop()).not.toThrow();
  });

  test("hide → show before timeout fires cancels idle and does NOT fire onActive", () => {
    const { timer, simulateHide, simulateShow, idleCallbacks, activeCallbacks } = makeTimer();
    timer.start();
    simulateHide(); // schedules timeout
    simulateShow(); // cancels timeout before it fires
    expect(idleCallbacks.length).toBe(0);
    expect(activeCallbacks.length).toBe(0);
  });

  test("hide → timeout fires → show fires onIdle then onActive", () => {
    const { timer, simulateHide, simulateShow, idleCallbacks, activeCallbacks, flushAllTimeouts } = makeTimer();
    timer.start();
    simulateHide();
    flushAllTimeouts(); // fire idle timeout → onIdle
    expect(idleCallbacks.length).toBe(1);
    simulateShow(); // tab becomes visible after idle → onActive
    expect(activeCallbacks.length).toBe(1);
  });

  test("stop clears hasFiredIdle so subsequent start works cleanly", () => {
    const { timer, simulateHide, simulateShow, idleCallbacks, activeCallbacks, flushAllTimeouts } = makeTimer();
    timer.start();
    simulateHide();
    flushAllTimeouts();
    expect(idleCallbacks.length).toBe(1);
    timer.stop(); // resets hasFiredIdle
    timer.start();
    // After restart: show should NOT fire onActive (hasFiredIdle was reset)
    simulateShow();
    expect(activeCallbacks.length).toBe(0);
  });
});

// ── realtimeQueryKeys ──────────────────────────────────────────────────────────

describe("realtimeQueryKeys", () => {
  test("workflowQueryKey returns array with workflowId", () => {
    const key = workflowQueryKey("wf-1");
    expect(key).toEqual(["workflow", "wf-1"]);
  });

  test("workflowRunsQueryKey returns array with workflowId", () => {
    const key = workflowRunsQueryKey("wf-2");
    expect(key).toEqual(["workflow-runs", "wf-2"]);
  });

  test("workflowDebuggerOverlayQueryKey returns correct key", () => {
    expect(workflowDebuggerOverlayQueryKey("wf-3")).toEqual(["workflow-debugger-overlay", "wf-3"]);
  });

  test("workflowDevBuildStateQueryKey returns correct key", () => {
    expect(workflowDevBuildStateQueryKey("wf-4")).toEqual(["workflow-dev-build-state", "wf-4"]);
  });

  test("runQueryKey returns array with runId", () => {
    expect(runQueryKey("run-1")).toEqual(["run", "run-1"]);
  });

  test("runDetailQueryKey returns array with runId", () => {
    expect(runDetailQueryKey("run-1")).toEqual(["run-detail", "run-1"]);
  });

  test("telemetryRunTraceQueryKey returns correct key", () => {
    expect(telemetryRunTraceQueryKey("run-1")).toEqual(["telemetry-run-trace", "run-1"]);
  });

  test("workflowCredentialHealthQueryKey returns correct key", () => {
    expect(workflowCredentialHealthQueryKey("wf-5")).toEqual(["workflow-credential-health", "wf-5"]);
  });

  test("workflowTestSuiteRunsQueryKey returns correct key", () => {
    expect(workflowTestSuiteRunsQueryKey("wf-6")).toEqual(["workflow-test-suite-runs", "wf-6"]);
  });

  test("testSuiteRunDetailQueryKey returns correct key", () => {
    expect(testSuiteRunDetailQueryKey("ts-1")).toEqual(["test-suite-run-detail", "ts-1"]);
  });

  test("testSuiteRunAssertionsQueryKey returns correct key", () => {
    expect(testSuiteRunAssertionsQueryKey("ts-1")).toEqual(["test-suite-run-assertions", "ts-1"]);
  });

  test("testSuiteRunChildRunsQueryKey returns correct key", () => {
    expect(testSuiteRunChildRunsQueryKey("ts-1")).toEqual(["test-suite-run-child-runs", "ts-1"]);
  });

  test("runAssertionsQueryKey returns correct key", () => {
    expect(runAssertionsQueryKey("run-2")).toEqual(["run-assertions", "run-2"]);
  });

  test("assertionMetricTrendsQueryKey sorts names and returns correct key", () => {
    const key = assertionMetricTrendsQueryKey("wf-7", ["b-metric", "a-metric"]);
    expect(key).toEqual(["assertion-metric-trends", "wf-7", "a-metric,b-metric"]);
  });
});
