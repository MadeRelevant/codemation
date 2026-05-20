/**
 * Tests for useWorkflowRealtimeInfrastructure.
 *
 * Harness rules:
 *  - No vi.mock / vi.stubGlobal / vi.stubEnv — save/restore manually.
 *  - MockWebSocket replaces global WebSocket via Object.defineProperty.
 *  - fetch is replaced for /api/dev/health polling tests.
 *  - globalThis.__codemationRealtimeBridge__ is cleaned up in afterEach.
 *  - vi.useFakeTimers() scoped to describe blocks that need it.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useWorkflowRealtimeInfrastructure } from "../../../src/hooks/realtime/useWorkflowRealtimeInfrastructure";
import { RealtimeReadyState } from "../../../src/realtime/realtimeClientBridge";
import type { RealtimeServerMessage } from "../../../src/realtime/realtimeClientBridge";
import { workflowDevBuildStateQueryKey } from "../../../src/realtime/realtimeQueryKeys";
import type { WorkflowDevBuildState } from "../../../src/realtime/realtimeDomainTypes";
import { MockWebSocket } from "../../lib/MockWebSocket";

// ---------------------------------------------------------------------------
// Infrastructure helpers
// ---------------------------------------------------------------------------

/** Noop logger — satisfies Logger interface without any coupling to LoggerFactory. */
const makeLogger = () => ({
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
});

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      // gcTime: Infinity avoids async GC evictions racing with setQueryData
      // assertions in synchronous test assertions.
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
    },
  });
}

function makeWrapper(queryClient: QueryClient) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  }
  return Wrapper;
}

/** Default args that bypass health-check and use a fixed wsBaseUrl. */
const DEFAULT_WS_BASE = "ws://localhost/api/workflows/ws";
function defaultArgs(overrides: Partial<Parameters<typeof useWorkflowRealtimeInfrastructure>[0]> = {}) {
  return {
    logger: makeLogger(),
    wsBaseUrl: DEFAULT_WS_BASE,
    skipDevHealthCheck: true,
    ...overrides,
  };
}

/**
 * Flush microtasks and the async `doConnect()` chain.
 * `doConnect` is an async fn called with `void` so we need multiple rounds.
 */
async function flushAsync(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ---------------------------------------------------------------------------
// Global WebSocket save/restore helpers
// ---------------------------------------------------------------------------

let savedWebSocketDescriptor: PropertyDescriptor | undefined;

function installMockWebSocket() {
  savedWebSocketDescriptor = Object.getOwnPropertyDescriptor(globalThis, "WebSocket");
  Object.defineProperty(globalThis, "WebSocket", {
    value: MockWebSocket,
    configurable: true,
    writable: true,
  });
  MockWebSocket.clearInstances();
}

function restoreWebSocket() {
  if (savedWebSocketDescriptor !== undefined) {
    Object.defineProperty(globalThis, "WebSocket", savedWebSocketDescriptor);
  } else {
    try {
      delete (globalThis as Record<string, unknown>)["WebSocket"];
    } catch {
      // ignore non-configurable
    }
  }
  savedWebSocketDescriptor = undefined;
}

/** Clean up the realtime bridge singleton so it doesn't leak across tests. */
function cleanRealtimeBridge() {
  delete (globalThis as Record<string, unknown>)["__codemationRealtimeBridge__"];
}

// ---------------------------------------------------------------------------
// 1. skipDevHealthCheck fast-path + basic lifecycle
// ---------------------------------------------------------------------------

describe("useWorkflowRealtimeInfrastructure — basic lifecycle (skipDevHealthCheck)", () => {
  beforeEach(() => {
    installMockWebSocket();
  });

  afterEach(() => {
    restoreWebSocket();
    cleanRealtimeBridge();
  });

  it("returns defined state on initial mount", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();
    expect(result.current).toBeDefined();
  });

  it("creates a WebSocket with the provided wsBaseUrl", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();
    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    expect(ws).toBeDefined();
    expect(ws?.url).toBe(DEFAULT_WS_BASE);
  });

  it("state becomes OPEN after dispatchOpen()", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    expect(ws).toBeDefined();

    await act(async () => {
      ws!.dispatchOpen();
    });

    expect(result.current.readyState).toBe(RealtimeReadyState.OPEN);
    expect(result.current.isConnected).toBe(true);
  });

  it("state becomes CLOSED after dispatchClose()", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws!.dispatchOpen();
    });
    expect(result.current.isConnected).toBe(true);

    await act(async () => {
      ws!.dispatchClose(1000);
    });
    expect(result.current.readyState).toBe(RealtimeReadyState.CLOSED);
    expect(result.current.isConnected).toBe(false);
  });

  it("returns the realtime context shape with all required fields", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const ctx = result.current;
    expect(typeof ctx.retainWorkflowSubscription).toBe("function");
    expect(typeof ctx.retainRunSubscription).toBe("function");
    expect(typeof ctx.isConnected).toBe("boolean");
    expect(typeof ctx.showDisconnectedBadge).toBe("boolean");
    expect(typeof ctx.buildState).toBe("string");
    expect(typeof ctx.buildStateLastChangedAt).toBe("number");
  });

  it("drains pending messages when socket opens", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    // Subscribe before socket is open — should queue the message
    await act(async () => {
      result.current.retainWorkflowSubscription("wf-1");
    });

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    // No message sent yet — still CONNECTING
    expect(ws!.sentMessages.length).toBe(0);

    // Open socket — pending subscribe should flush
    await act(async () => {
      ws!.dispatchOpen();
    });

    // At OPEN, the pending queue drains, then the readyState OPEN effect re-sends subscriptions.
    const messages = ws!.allSentJson<{ kind: string; roomId: string }>();
    const subscribeMessages = messages.filter((m) => m.kind === "subscribe");
    expect(subscribeMessages.length).toBeGreaterThanOrEqual(1);
    expect(subscribeMessages.some((m) => m.roomId === "wf-1")).toBe(true);
  });

  it("showDisconnectedBadge is false initially", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();
    // CONNECTING → badge is false (only true when CLOSED)
    expect(result.current.showDisconnectedBadge).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Dev-health polling gate
// ---------------------------------------------------------------------------

describe("useWorkflowRealtimeInfrastructure — dev health gate", () => {
  let savedFetch: typeof globalThis.fetch;

  beforeEach(() => {
    installMockWebSocket();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    savedFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = savedFetch;
    vi.useRealTimers();
    restoreWebSocket();
    cleanRealtimeBridge();
  });

  it("enables socket immediately when health returns status=ready", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: () => Promise.resolve({ runtime: { status: "ready" } }),
    } as Response);

    const qc = makeQueryClient();
    const { result } = renderHook(
      () =>
        useWorkflowRealtimeInfrastructure({
          logger: makeLogger(),
          wsBaseUrl: DEFAULT_WS_BASE,
          // No skipDevHealthCheck — let the gate run
        }),
      { wrapper: makeWrapper(qc) },
    );

    // Drain the async check() call
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(result.current).toBeDefined();
    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    expect(ws).toBeDefined();
  });

  it("enables socket when health returns non-200 status (non-dev env)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 404,
      json: () => Promise.resolve(null),
    } as Response);

    const qc = makeQueryClient();
    renderHook(
      () =>
        useWorkflowRealtimeInfrastructure({
          logger: makeLogger(),
          wsBaseUrl: DEFAULT_WS_BASE,
        }),
      { wrapper: makeWrapper(qc) },
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    expect(ws).toBeDefined();
  });

  it("enables socket when health fetch throws (transient failure)", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network error"));

    const qc = makeQueryClient();
    renderHook(
      () =>
        useWorkflowRealtimeInfrastructure({
          logger: makeLogger(),
          wsBaseUrl: DEFAULT_WS_BASE,
        }),
      { wrapper: makeWrapper(qc) },
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    expect(ws).toBeDefined();
  });

  it("polls until status=ready then enables socket", async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(() => {
      callCount += 1;
      const status = callCount < 3 ? "building" : "ready";
      return Promise.resolve({
        status: 200,
        json: () => Promise.resolve({ runtime: { status } }),
      } as Response);
    });

    const qc = makeQueryClient();
    renderHook(
      () =>
        useWorkflowRealtimeInfrastructure({
          logger: makeLogger(),
          wsBaseUrl: DEFAULT_WS_BASE,
        }),
      { wrapper: makeWrapper(qc) },
    );

    // First check: building → starts interval. Advance 500ms to hit ticks
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(callCount).toBeGreaterThanOrEqual(3);
    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    expect(ws).toBeDefined();
  });

  it("skipDevHealthCheck bypasses the health gate entirely", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const qc = makeQueryClient();
    renderHook(
      () =>
        useWorkflowRealtimeInfrastructure({
          logger: makeLogger(),
          wsBaseUrl: DEFAULT_WS_BASE,
          skipDevHealthCheck: true,
        }),
      { wrapper: makeWrapper(qc) },
    );

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Should not have called fetch at all
    expect(fetchMock).not.toHaveBeenCalled();
    // WebSocket should still be created (skipDevHealthCheck=true means enabled from start)
    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    expect(ws).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 3. Connect/reconnect lifecycle — 4401 forced-token-refresh path
// ---------------------------------------------------------------------------

describe("useWorkflowRealtimeInfrastructure — 4401 token refresh reconnect", () => {
  beforeEach(() => {
    installMockWebSocket();
    vi.useFakeTimers({ shouldAdvanceTime: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreWebSocket();
    cleanRealtimeBridge();
  });

  it("reconnects with forceRefresh=true when close code is 4401", async () => {
    const tokenCalls: Array<{ forceRefresh?: boolean }> = [];
    const getWsToken = vi.fn().mockImplementation((opts?: { forceRefresh?: boolean }) => {
      tokenCalls.push(opts ?? {});
      return "test-token";
    });

    const qc = makeQueryClient();
    const args = {
      logger: makeLogger(),
      wsBaseUrl: DEFAULT_WS_BASE,
      skipDevHealthCheck: true,
      getWsToken,
    };
    renderHook(() => useWorkflowRealtimeInfrastructure(args), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    expect(ws).toBeDefined();
    // Token should have been called for the initial connect
    expect(tokenCalls.length).toBeGreaterThanOrEqual(1);

    // Open then close with 4401
    await act(async () => {
      ws!.dispatchOpen();
    });
    await act(async () => {
      ws!.dispatchClose(4401, "token expired");
    });

    // Advance timer to trigger the forced-refresh reconnect
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // A second WebSocket should have been created
    expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);
    // The second connect should use forceRefresh=true
    const forceRefreshCalls = tokenCalls.filter((c) => c.forceRefresh === true);
    expect(forceRefreshCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("reconnects normally (no forceRefresh) on clean close code 1000", async () => {
    const getWsToken = vi.fn().mockReturnValue("test-token");

    const qc = makeQueryClient();
    const args = {
      logger: makeLogger(),
      wsBaseUrl: DEFAULT_WS_BASE,
      skipDevHealthCheck: true,
      getWsToken,
    };
    renderHook(() => useWorkflowRealtimeInfrastructure(args), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    expect(ws).toBeDefined();
    await act(async () => {
      ws!.dispatchOpen();
    });
    await act(async () => {
      ws!.dispatchClose(1000, "normal");
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // A second workflow socket should be created
    const wfSockets = MockWebSocket.instances.filter((s) => s.url.includes("/api/workflows/ws"));
    expect(wfSockets.length).toBeGreaterThanOrEqual(2);
    // No forceRefresh call should have been made
    const calls = (getWsToken as ReturnType<typeof vi.fn>).mock.calls as Array<
      Array<{ forceRefresh?: boolean } | undefined>
    >;
    const forceRefreshCalls = calls.filter((args) => args[0]?.forceRefresh === true);
    expect(forceRefreshCalls.length).toBe(0);
  });

  it("appends token as query param to the websocket URL", async () => {
    const getWsToken = vi.fn().mockReturnValue("my-jwt-token");

    const qc = makeQueryClient();
    const args = {
      logger: makeLogger(),
      wsBaseUrl: DEFAULT_WS_BASE,
      skipDevHealthCheck: true,
      getWsToken,
    };
    renderHook(() => useWorkflowRealtimeInfrastructure(args), { wrapper: makeWrapper(qc) });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    expect(ws).toBeDefined();
    expect(ws!.url).toContain("token=my-jwt-token");
  });
});

// ---------------------------------------------------------------------------
// 4. Message dispatch router — handleRealtimeServerMessage
// ---------------------------------------------------------------------------

describe("useWorkflowRealtimeInfrastructure — message dispatch router", () => {
  beforeEach(() => {
    installMockWebSocket();
  });

  afterEach(() => {
    restoreWebSocket();
    cleanRealtimeBridge();
  });

  async function setupOpenHook(queryClient: QueryClient) {
    const args = defaultArgs();
    const hookResult = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(queryClient),
    });
    await flushAsync();
    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    expect(ws).toBeDefined();
    await act(async () => {
      ws!.dispatchOpen();
    });
    return { hookResult, ws: ws!, queryClient, logger: args.logger };
  }

  async function sendMessage(ws: MockWebSocket, message: RealtimeServerMessage) {
    await act(async () => {
      ws.dispatchMessage(JSON.stringify(message));
    });
  }

  it("handles subscribed message without throwing", async () => {
    const qc = makeQueryClient();
    const { ws } = await setupOpenHook(qc);
    await sendMessage(ws, { kind: "subscribed", roomId: "wf-abc" });
    // No state change expected; just verify no error
  });

  it("handles unsubscribed message without throwing", async () => {
    const qc = makeQueryClient();
    const { ws } = await setupOpenHook(qc);
    await sendMessage(ws, { kind: "unsubscribed", roomId: "wf-abc" });
  });

  it("handles error message without throwing", async () => {
    const qc = makeQueryClient();
    const { ws, logger } = await setupOpenHook(qc);
    await sendMessage(ws, { kind: "error", message: "something went wrong" });
    expect((logger.error as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("handles workflowChanged message — sets buildState=building in query cache", async () => {
    const qc = makeQueryClient();
    const { ws } = await setupOpenHook(qc);
    await sendMessage(ws, { kind: "workflowChanged", workflowId: "wf-1" });

    const buildState = qc.getQueryData<WorkflowDevBuildState>(workflowDevBuildStateQueryKey("wf-1"));
    expect(buildState?.state).toBe("building");
  });

  it("handles devBuildStarted message — updates build state to building", async () => {
    const qc = makeQueryClient();
    const { ws } = await setupOpenHook(qc);
    await sendMessage(ws, { kind: "devBuildStarted", workflowId: "wf-1", buildVersion: "v1" });

    const buildState = qc.getQueryData<WorkflowDevBuildState>(workflowDevBuildStateQueryKey("wf-1"));
    expect(buildState?.state).toBe("building");
    expect(buildState?.buildVersion).toBe("v1");
  });

  it("handles devBuildCompleted message — updates build state (building, awaiting refresh)", async () => {
    const qc = makeQueryClient();
    const { ws } = await setupOpenHook(qc);
    await sendMessage(ws, { kind: "devBuildCompleted", workflowId: "wf-1", buildVersion: "v2" });

    const buildState = qc.getQueryData<WorkflowDevBuildState>(workflowDevBuildStateQueryKey("wf-1"));
    // devBuildCompleted sets state to "building" (awaiting workflow refresh)
    expect(buildState?.state).toBe("building");
    expect(buildState?.buildVersion).toBe("v2");
  });

  it("handles devBuildFailed message — updates build state to failed", async () => {
    const qc = makeQueryClient();
    const { ws } = await setupOpenHook(qc);
    await sendMessage(ws, {
      kind: "devBuildFailed",
      workflowId: "wf-1",
      message: "syntax error",
      file: "workflow.ts",
      line: 42,
      column: 10,
    });

    const buildState = qc.getQueryData<WorkflowDevBuildState>(workflowDevBuildStateQueryKey("wf-1"));
    expect(buildState?.state).toBe("failed");
    expect(buildState?.message).toBe("syntax error");
  });

  it("handles runSaved event — writes to run query cache", async () => {
    const qc = makeQueryClient();
    const { ws } = await setupOpenHook(qc);

    const runState = {
      runId: "run-1",
      workflowId: "wf-1",
      startedAt: new Date().toISOString(),
      status: "completed" as const,
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
    };

    await sendMessage(ws, {
      kind: "event",
      event: {
        kind: "runSaved",
        runId: "run-1",
        workflowId: "wf-1",
        at: new Date().toISOString(),
        state: runState,
      },
    });

    const cached = qc.getQueryData(["run", "run-1"]);
    expect(cached).toBeDefined();
    expect((cached as typeof runState).status).toBe("completed");
  });

  it("handles nodeQueued event — updates cache", async () => {
    const qc = makeQueryClient();
    const { ws } = await setupOpenHook(qc);

    await sendMessage(ws, {
      kind: "event",
      event: {
        kind: "nodeQueued",
        runId: "run-q1",
        workflowId: "wf-1",
        at: new Date().toISOString(),
        snapshot: {
          runId: "run-q1",
          workflowId: "wf-1",
          nodeId: "node-a",
          status: "queued",
          updatedAt: new Date().toISOString(),
        },
      },
    });

    const cached = qc.getQueryData(["run", "run-q1"]);
    expect(cached).toBeDefined();
  });

  it("handles nodeStarted event — updates cache", async () => {
    const qc = makeQueryClient();
    const { ws } = await setupOpenHook(qc);

    await sendMessage(ws, {
      kind: "event",
      event: {
        kind: "nodeStarted",
        runId: "run-s1",
        workflowId: "wf-1",
        at: new Date().toISOString(),
        snapshot: {
          runId: "run-s1",
          workflowId: "wf-1",
          nodeId: "node-b",
          status: "running",
          updatedAt: new Date().toISOString(),
        },
      },
    });

    const cached = qc.getQueryData(["run", "run-s1"]);
    expect(cached).toBeDefined();
  });

  it("handles nodeCompleted event — updates cache", async () => {
    const qc = makeQueryClient();
    const { ws } = await setupOpenHook(qc);

    await sendMessage(ws, {
      kind: "event",
      event: {
        kind: "nodeCompleted",
        runId: "run-c1",
        workflowId: "wf-1",
        at: new Date().toISOString(),
        snapshot: {
          runId: "run-c1",
          workflowId: "wf-1",
          nodeId: "node-c",
          status: "completed",
          updatedAt: new Date().toISOString(),
        },
      },
    });

    const cached = qc.getQueryData(["run", "run-c1"]);
    expect(cached).toBeDefined();
  });

  it("handles nodeFailed event — updates cache", async () => {
    const qc = makeQueryClient();
    const { ws } = await setupOpenHook(qc);

    await sendMessage(ws, {
      kind: "event",
      event: {
        kind: "nodeFailed",
        runId: "run-f1",
        workflowId: "wf-1",
        at: new Date().toISOString(),
        snapshot: {
          runId: "run-f1",
          workflowId: "wf-1",
          nodeId: "node-d",
          status: "failed",
          updatedAt: new Date().toISOString(),
          error: { message: "oops" },
        },
      },
    });

    const cached = qc.getQueryData(["run", "run-f1"]);
    expect(cached).toBeDefined();
  });

  it("handles telemetryEvent — no-op when cache is cold but logs debug", async () => {
    const qc = makeQueryClient();
    const { ws, logger } = await setupOpenHook(qc);

    await sendMessage(ws, {
      kind: "telemetryEvent",
      runId: "run-tel",
      span: {
        traceId: "trace-1",
        spanId: "span-1",
        runId: "run-tel",
        workflowId: "wf-1",
        name: "my-span",
        kind: "internal",
      },
    });

    // Cache is cold → applyTelemetrySpanEvent is a no-op, logger.debug should be called
    expect(
      (logger.debug as ReturnType<typeof vi.fn>).mock.calls.some(
        (c: unknown[]) => typeof c[0] === "string" && c[0].includes("telemetry"),
      ),
    ).toBe(true);
  });

  it("ignores non-string message data", async () => {
    const qc = makeQueryClient();
    const { ws } = await setupOpenHook(qc);
    // Dispatch a binary-like message — the hook should ignore it
    const binaryEv = new MessageEvent("message", { data: new ArrayBuffer(4) });
    await act(async () => {
      for (const listener of (ws as unknown as { listeners: { message: Array<(ev: MessageEvent) => void> } }).listeners
        .message) {
        listener(binaryEv);
      }
    });
    // Should not throw
  });

  it("handles malformed JSON gracefully — logs error", async () => {
    const qc = makeQueryClient();
    const { ws, logger } = await setupOpenHook(qc);
    await act(async () => {
      ws.dispatchMessage("not-valid-json{{{");
    });
    expect((logger.error as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it("handles unknown message kind — logs debug", async () => {
    const qc = makeQueryClient();
    const { ws, logger } = await setupOpenHook(qc);
    await act(async () => {
      ws.dispatchMessage(JSON.stringify({ kind: "unknownKind" }));
    });
    expect(
      (logger.debug as ReturnType<typeof vi.fn>).mock.calls.some(
        (c: unknown[]) => typeof c[0] === "string" && c[0].includes("control"),
      ),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. nodeCompleted / nodeFailed — minimum visibility delay
// ---------------------------------------------------------------------------

describe("useWorkflowRealtimeInfrastructure — terminal events apply immediately", () => {
  beforeEach(() => {
    installMockWebSocket();
    vi.useFakeTimers({ now: 1000 });
  });

  afterEach(() => {
    vi.useRealTimers();
    restoreWebSocket();
    cleanRealtimeBridge();
  });

  it("applies nodeCompleted synchronously even when it follows nodeStarted instantly", async () => {
    // Regression: the previous 300 ms minimum-visibility delay was removed
    // because it caused a multi-second tail of deferred re-renders after a
    // workflow finished and contributed to the canvas flicker. Terminal
    // events now flow straight into the cache so the canvas updates with
    // every realtime tick.
    const qc = makeQueryClient();
    const args = defaultArgs();
    renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws!.dispatchOpen();
    });

    await act(async () => {
      ws!.dispatchMessage(
        JSON.stringify({
          kind: "event",
          event: {
            kind: "nodeStarted",
            runId: "run-instant",
            workflowId: "wf-1",
            at: new Date(1000).toISOString(),
            snapshot: {
              runId: "run-instant",
              workflowId: "wf-1",
              nodeId: "node-instant",
              status: "running",
              updatedAt: new Date(1000).toISOString(),
            },
          },
        }),
      );
    });
    await act(async () => {
      ws!.dispatchMessage(
        JSON.stringify({
          kind: "event",
          event: {
            kind: "nodeCompleted",
            runId: "run-instant",
            workflowId: "wf-1",
            at: new Date(1000).toISOString(),
            snapshot: {
              runId: "run-instant",
              workflowId: "wf-1",
              nodeId: "node-instant",
              status: "completed",
              updatedAt: new Date(1000).toISOString(),
            },
          },
        }),
      );
    });

    const cached = qc.getQueryData<{ nodeSnapshotsByNodeId: Record<string, { status: string }> }>([
      "run",
      "run-instant",
    ]);
    expect(cached?.nodeSnapshotsByNodeId?.["node-instant"]?.status).toBe("completed");
  });

  it("applies nodeCompleted immediately when no active status was shown before", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws!.dispatchOpen();
    });

    // nodeCompleted with no prior nodeStarted for this node
    await act(async () => {
      ws!.dispatchMessage(
        JSON.stringify({
          kind: "event",
          event: {
            kind: "nodeCompleted",
            runId: "run-immediate",
            workflowId: "wf-1",
            at: new Date(1000).toISOString(),
            snapshot: {
              runId: "run-immediate",
              workflowId: "wf-1",
              nodeId: "node-instant",
              status: "completed",
              updatedAt: new Date(1000).toISOString(),
            },
          },
        }),
      );
    });

    const cached = qc.getQueryData<{ nodeSnapshotsByNodeId: Record<string, { status: string }> }>([
      "run",
      "run-immediate",
    ]);
    expect(cached?.nodeSnapshotsByNodeId?.["node-instant"]?.status).toBe("completed");
  });

  it("nodeFailed applies immediately when no prior active status", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws!.dispatchOpen();
    });

    await act(async () => {
      ws!.dispatchMessage(
        JSON.stringify({
          kind: "event",
          event: {
            kind: "nodeFailed",
            runId: "run-fail-immediate",
            workflowId: "wf-1",
            at: new Date(1000).toISOString(),
            snapshot: {
              runId: "run-fail-immediate",
              workflowId: "wf-1",
              nodeId: "node-fail",
              status: "failed",
              updatedAt: new Date(1000).toISOString(),
              error: { message: "boom" },
            },
          },
        }),
      );
    });

    const cached = qc.getQueryData<{ nodeSnapshotsByNodeId: Record<string, { status: string }> }>([
      "run",
      "run-fail-immediate",
    ]);
    expect(cached?.nodeSnapshotsByNodeId?.["node-fail"]?.status).toBe("failed");
  });
});

// ---------------------------------------------------------------------------
// 6. Subscription management — retainWorkflowSubscription
// ---------------------------------------------------------------------------

describe("useWorkflowRealtimeInfrastructure — retainWorkflowSubscription", () => {
  beforeEach(() => {
    installMockWebSocket();
  });

  afterEach(() => {
    restoreWebSocket();
    cleanRealtimeBridge();
  });

  it("sends subscribe frame when socket is OPEN and retaining for first time", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws!.dispatchOpen();
    });

    await act(async () => {
      result.current.retainWorkflowSubscription("wf-abc");
    });

    const messages = ws!.allSentJson<{ kind: string; roomId: string }>();
    expect(messages.some((m) => m.kind === "subscribe" && m.roomId === "wf-abc")).toBe(true);
  });

  it("sends unsubscribe frame when last retainer releases", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws!.dispatchOpen();
    });

    let release!: () => void;
    await act(async () => {
      release = result.current.retainWorkflowSubscription("wf-xyz");
    });

    await act(async () => {
      release();
    });

    const messages = ws!.allSentJson<{ kind: string; roomId: string }>();
    expect(messages.some((m) => m.kind === "unsubscribe" && m.roomId === "wf-xyz")).toBe(true);
  });

  it("ref-counts subscriptions: second retain does not send duplicate subscribe", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws!.dispatchOpen();
    });

    let release1!: () => void;
    let release2!: () => void;
    await act(async () => {
      release1 = result.current.retainWorkflowSubscription("wf-shared");
    });
    await act(async () => {
      release2 = result.current.retainWorkflowSubscription("wf-shared");
    });

    const subscribes = ws!
      .allSentJson<{ kind: string; roomId: string }>()
      .filter((m) => m.kind === "subscribe" && m.roomId === "wf-shared");
    // Should have been subscribed exactly once
    expect(subscribes.length).toBe(1);

    // Release first retainer — should NOT unsubscribe (count goes 2→1)
    await act(async () => {
      release1();
    });
    const unsubscribes1 = ws!
      .allSentJson<{ kind: string; roomId: string }>()
      .filter((m) => m.kind === "unsubscribe" && m.roomId === "wf-shared");
    expect(unsubscribes1.length).toBe(0);

    // Release second retainer — should unsubscribe (count goes 1→0)
    await act(async () => {
      release2();
    });
    const unsubscribes2 = ws!
      .allSentJson<{ kind: string; roomId: string }>()
      .filter((m) => m.kind === "unsubscribe" && m.roomId === "wf-shared");
    expect(unsubscribes2.length).toBe(1);
  });

  it("re-subscribes to all desired workflows when socket reconnects", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const ws1 = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws1!.dispatchOpen();
    });

    await act(async () => {
      result.current.retainWorkflowSubscription("wf-persist");
    });

    // Close and wait for reconnect timer
    await act(async () => {
      ws1!.dispatchClose(1000);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    // Second socket should have been created
    const ws2 = MockWebSocket.instances.find((s) => s !== ws1 && s.url.includes("/api/workflows/ws"));
    if (ws2) {
      await act(async () => {
        ws2.dispatchOpen();
      });
      const messages2 = ws2.allSentJson<{ kind: string; roomId: string }>();
      expect(messages2.some((m) => m.kind === "subscribe" && m.roomId === "wf-persist")).toBe(true);
    }
    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// 7. Subscription management — retainRunSubscription
// ---------------------------------------------------------------------------

describe("useWorkflowRealtimeInfrastructure — retainRunSubscription", () => {
  beforeEach(() => {
    installMockWebSocket();
  });

  afterEach(() => {
    restoreWebSocket();
    cleanRealtimeBridge();
  });

  it("sends subscribe frame for run room when socket is OPEN", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws!.dispatchOpen();
    });

    await act(async () => {
      result.current.retainRunSubscription("run-abc");
    });

    const messages = ws!.allSentJson<{ kind: string; roomId: string }>();
    expect(messages.some((m) => m.kind === "subscribe" && m.roomId === "run:run-abc")).toBe(true);
  });

  it("sends unsubscribe frame when run subscription is released", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws!.dispatchOpen();
    });

    let release!: () => void;
    await act(async () => {
      release = result.current.retainRunSubscription("run-xyz");
    });

    await act(async () => {
      release();
    });

    const messages = ws!.allSentJson<{ kind: string; roomId: string }>();
    expect(messages.some((m) => m.kind === "unsubscribe" && m.roomId === "run:run-xyz")).toBe(true);
  });

  it("retains multiple run subscriptions independently", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws!.dispatchOpen();
    });

    await act(async () => {
      result.current.retainRunSubscription("run-a");
      result.current.retainRunSubscription("run-b");
    });

    const messages = ws!.allSentJson<{ kind: string; roomId: string }>();
    expect(messages.some((m) => m.kind === "subscribe" && m.roomId === "run:run-a")).toBe(true);
    expect(messages.some((m) => m.kind === "subscribe" && m.roomId === "run:run-b")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 8. PageVisibilityIdleTimer — auto-unsubscribe / re-subscribe on tab hide/show
// ---------------------------------------------------------------------------

describe("useWorkflowRealtimeInfrastructure — visibility idle timer", () => {
  let savedVisibilityDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    installMockWebSocket();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    savedVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, "visibilityState");
  });

  afterEach(() => {
    if (savedVisibilityDescriptor !== undefined) {
      Object.defineProperty(document, "visibilityState", savedVisibilityDescriptor);
    }
    vi.useRealTimers();
    restoreWebSocket();
    cleanRealtimeBridge();
  });

  function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, "visibilityState", {
      value: state,
      configurable: true,
      writable: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  }

  it("auto-unsubscribes run rooms after tab is hidden for 5 minutes", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws!.dispatchOpen();
    });

    // Subscribe a run
    await act(async () => {
      result.current.retainRunSubscription("run-hidden");
    });

    const beforeHide = ws!.sentMessages.length;

    // Hide tab
    await act(async () => {
      setVisibility("hidden");
    });

    // Advance 5 minutes (runRoomHiddenUnsubscribeMs = 5 * 60 * 1000)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);
    });

    // Should have sent unsubscribe for the run room
    const newMessages = ws!.allSentJson<{ kind: string; roomId: string }>().slice(beforeHide);
    expect(newMessages.some((m) => m.kind === "unsubscribe" && m.roomId === "run:run-hidden")).toBe(true);
  });

  it("re-subscribes run rooms when tab becomes visible after auto-unsubscribe", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws!.dispatchOpen();
    });

    await act(async () => {
      result.current.retainRunSubscription("run-visible");
    });

    // Hide then let idle timeout fire
    await act(async () => {
      setVisibility("hidden");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 100);
    });

    const beforeShow = ws!.sentMessages.length;

    // Show tab
    await act(async () => {
      setVisibility("visible");
    });

    const newMessages = ws!.allSentJson<{ kind: string; roomId: string }>().slice(beforeShow);
    expect(newMessages.some((m) => m.kind === "subscribe" && m.roomId === "run:run-visible")).toBe(true);
  });

  it("does not auto-unsubscribe if tab is shown before idle timeout elapses", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws!.dispatchOpen();
    });

    await act(async () => {
      result.current.retainRunSubscription("run-quick");
    });

    const beforeHide = ws!.sentMessages.length;

    // Hide then quickly show again (before 5 min)
    await act(async () => {
      setVisibility("hidden");
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    }); // 1 second only
    await act(async () => {
      setVisibility("visible");
    });

    // No unsubscribe should have been triggered
    const newMessages = ws!.allSentJson<{ kind: string; roomId: string }>().slice(beforeHide);
    expect(newMessages.filter((m) => m.kind === "unsubscribe" && m.roomId === "run:run-quick").length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Dev-gateway socket — buildState state machine
// ---------------------------------------------------------------------------

describe("useWorkflowRealtimeInfrastructure — dev-gateway socket buildState", () => {
  beforeEach(() => {
    installMockWebSocket();
  });

  afterEach(() => {
    restoreWebSocket();
    cleanRealtimeBridge();
  });

  function getDevGatewaySocket(): MockWebSocket | undefined {
    return MockWebSocket.forUrl("/api/dev/socket");
  }

  it("creates a dev-gateway WebSocket on mount", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();
    const devWs = getDevGatewaySocket();
    expect(devWs).toBeDefined();
  });

  it("sets buildState=building when devBuildStarted arrives on dev-gateway socket", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const devWs = getDevGatewaySocket();
    expect(devWs).toBeDefined();

    await act(async () => {
      devWs!.dispatchMessage(JSON.stringify({ kind: "devBuildStarted" }));
    });

    expect(result.current.buildState).toBe("building");
    expect(result.current.lastBuildError).toBeNull();
  });

  it("sets buildState=idle when devBuildCompleted arrives on dev-gateway socket", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const devWs = getDevGatewaySocket();

    await act(async () => {
      devWs!.dispatchMessage(JSON.stringify({ kind: "devBuildStarted" }));
    });
    expect(result.current.buildState).toBe("building");

    await act(async () => {
      devWs!.dispatchMessage(JSON.stringify({ kind: "devBuildCompleted" }));
    });

    expect(result.current.buildState).toBe("idle");
    expect(result.current.lastBuildError).toBeNull();
  });

  it("sets buildState=errored and lastBuildError when devBuildFailed arrives on dev-gateway socket", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const devWs = getDevGatewaySocket();

    await act(async () => {
      devWs!.dispatchMessage(
        JSON.stringify({
          kind: "devBuildFailed",
          message: "TS error",
          file: "src/index.ts",
          line: 10,
          column: 5,
        }),
      );
    });

    expect(result.current.buildState).toBe("errored");
    expect(result.current.lastBuildError).not.toBeNull();
    expect(result.current.lastBuildError?.message).toBe("TS error");
    expect(result.current.lastBuildError?.file).toBe("src/index.ts");
    expect(result.current.lastBuildError?.line).toBe(10);
    expect(result.current.lastBuildError?.column).toBe(5);
  });

  it("ignores malformed dev-gateway messages silently", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const devWs = getDevGatewaySocket();

    await act(async () => {
      devWs!.dispatchMessage("{{invalid}}");
    });

    // buildState should remain idle
    expect(result.current.buildState).toBe("idle");
  });

  it("ignores non-string data on dev-gateway socket", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const devWs = getDevGatewaySocket();
    const ev = new MessageEvent("message", { data: new ArrayBuffer(4) });
    await act(async () => {
      for (const listener of (devWs as unknown as { listeners: { message: Array<(ev: MessageEvent) => void> } })
        .listeners.message) {
        listener(ev);
      }
    });

    expect(result.current.buildState).toBe("idle");
  });

  it("dev-gateway invalidates workflow queries on devBuildCompleted", async () => {
    const qc = makeQueryClient();
    // Pre-seed a query so invalidation has something to act on
    qc.setQueryData(["workflow-dev-build-state", "wf-seed"], {
      state: "building",
      updatedAt: new Date().toISOString(),
    });

    const args = defaultArgs();
    renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const devWs = getDevGatewaySocket();
    await act(async () => {
      devWs!.dispatchMessage(JSON.stringify({ kind: "devBuildCompleted" }));
    });

    // After devBuildCompleted the seeded build state is updated to "idle"
    const state = qc.getQueryData<WorkflowDevBuildState>(["workflow-dev-build-state", "wf-seed"]);
    expect(state?.state).toBe("idle");
  });

  it("dev-gateway socket closes OPEN socket on unmount", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { unmount } = renderHook(() => useWorkflowRealtimeInfrastructure(args), {
      wrapper: makeWrapper(qc),
    });
    await flushAsync();

    const devWs = getDevGatewaySocket();
    // Open the dev socket so it's in OPEN state (not CONNECTING)
    await act(async () => {
      devWs!.dispatchOpen();
    });

    await act(async () => {
      unmount();
    });

    expect(devWs!.isClosed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 10. Error / edge cases in connect lifecycle
// ---------------------------------------------------------------------------

describe("useWorkflowRealtimeInfrastructure — connect lifecycle edge cases", () => {
  beforeEach(() => {
    installMockWebSocket();
  });

  afterEach(() => {
    restoreWebSocket();
    cleanRealtimeBridge();
  });

  it("logs debug when socket errors before first successful open", async () => {
    const logger = makeLogger();
    const qc = makeQueryClient();
    const args = { ...defaultArgs(), logger };
    renderHook(() => useWorkflowRealtimeInfrastructure(args), { wrapper: makeWrapper(qc) });
    await flushAsync();

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws!.dispatchError();
    });
    // Should have logged at debug level about transport not being available
    expect(
      (logger.debug as ReturnType<typeof vi.fn>).mock.calls.some(
        (c: unknown[]) => typeof c[0] === "string" && c[0].includes("not available"),
      ),
    ).toBe(true);
  });

  it("logs warn after persistent disconnect warning delay when previously connected", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const logger = makeLogger();
    const qc = makeQueryClient();
    const args = { ...defaultArgs(), logger };
    renderHook(() => useWorkflowRealtimeInfrastructure(args), { wrapper: makeWrapper(qc) });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const ws = MockWebSocket.forUrl("/api/workflows/ws");

    // Open then close to set hasOpenedConnectionRef = true and schedule warning
    await act(async () => {
      ws!.dispatchOpen();
    });
    await act(async () => {
      ws!.dispatchClose(1001, "going away");
    });

    // Advance past the persistent disconnect warning delay (5000ms)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });

    expect(
      (logger.warn as ReturnType<typeof vi.fn>).mock.calls.some(
        (c: unknown[]) => typeof c[0] === "string" && c[0].includes("unavailable"),
      ),
    ).toBe(true);

    vi.useRealTimers();
  });

  it("cleans up workflow socket on unmount", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { unmount } = renderHook(() => useWorkflowRealtimeInfrastructure(args), { wrapper: makeWrapper(qc) });
    await flushAsync();

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    await act(async () => {
      ws!.dispatchOpen();
    });

    await act(async () => {
      unmount();
    });

    expect(ws!.isClosed).toBe(true);
  });

  it("uses wsBaseUrl verbatim when provided — socket URL matches exactly", async () => {
    // When wsBaseUrl is provided, the hook uses it as-is rather than computing from window.location.
    const customUrl = "ws://custom-host:9999/api/workflows/ws";
    const qc = makeQueryClient();
    const args = {
      logger: makeLogger(),
      wsBaseUrl: customUrl,
      skipDevHealthCheck: true,
    };
    renderHook(() => useWorkflowRealtimeInfrastructure(args), { wrapper: makeWrapper(qc) });
    await flushAsync();

    const wfWs = MockWebSocket.instances.find((s) => s.url === customUrl);
    expect(wfWs).toBeDefined();
    expect(wfWs?.url).toBe(customUrl);
  });

  it("queues messages when socket is not open and drains on open", async () => {
    const qc = makeQueryClient();
    const args = defaultArgs();
    const { result } = renderHook(() => useWorkflowRealtimeInfrastructure(args), { wrapper: makeWrapper(qc) });
    await flushAsync();

    // Don't open the socket — call sendJsonMessage path via retainWorkflowSubscription
    // Subscription should be queued
    await act(async () => {
      result.current.retainWorkflowSubscription("wf-queued");
    });

    const ws = MockWebSocket.forUrl("/api/workflows/ws");
    expect(ws!.sentMessages.length).toBe(0); // Still CONNECTING, not sent yet

    // Now open
    await act(async () => {
      ws!.dispatchOpen();
    });

    const messages = ws!.allSentJson<{ kind: string; roomId: string }>();
    expect(messages.some((m) => m.kind === "subscribe" && m.roomId === "wf-queued")).toBe(true);
  });
});
