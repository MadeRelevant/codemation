import { RunFinishedAtFactory } from "@codemation/core";
import type { WorkflowEvent } from "@codemation/next-host/src/features/workflows/lib/realtime/realtimeDomainTypes";
import { reduceWorkflowEventIntoPersistedRunState } from "@codemation/next-host/src/features/workflows/lib/realtime/realtimeRunMutations";
import type {
  PersistedRunState,
  RunSummary,
  WorkflowDebuggerOverlayState,
  WorkflowDto,
} from "@codemation/next-host/src/features/workflows/hooks/realtime/realtime";
import { expect } from "vitest";
import { ApiPaths } from "../../../src/presentation/http/ApiPaths";
import { WorkflowDetailFixtureFactory } from "./WorkflowDetailFixtures";
import type { WorkflowDetailRealtimeServerMessage } from "./WorkflowDetailRealtimeFixtures";

type WorkflowRunRequestBody = Readonly<{
  workflowId: string;
  items: ReadonlyArray<Readonly<{ json: unknown }>>;
  stopAt?: string;
  clearFromNodeId?: string;
  mode?: "manual" | "debug";
  sourceRunId?: string;
}>;

type WorkflowNodeRunRequestBody = Readonly<{
  items?: ReadonlyArray<Readonly<{ json: unknown }>>;
  mode?: "manual" | "debug";
}>;

type WorkflowSnapshotRequestBody = Readonly<{
  workflowSnapshot: PersistedRunState["workflowSnapshot"];
}>;

type WorkflowDebuggerOverlayRequestBody = Readonly<{
  currentState?: WorkflowDebuggerOverlayState["currentState"];
}>;

type WorkflowDebuggerOverlayCopyRequestBody = Readonly<{
  sourceRunId?: string;
}>;

export class WorkflowDetailSocketConnection {
  readonly sentMessages: string[] = [];
  readonly url: string;
  readonly readyState = 1;
  private readonly listenersByType = new Map<string, Set<(event: unknown) => void>>();

  constructor(url: string | URL) {
    this.url = String(url);
    queueMicrotask(() => {
      this.dispatch("open", new Event("open"));
    });
  }

  addEventListener(type: string, listener: (event: unknown) => void): void {
    const listeners = this.listenersByType.get(type) ?? new Set<(event: unknown) => void>();
    listeners.add(listener);
    this.listenersByType.set(type, listeners);
  }

  removeEventListener(type: string, listener: (event: unknown) => void): void {
    this.listenersByType.get(type)?.delete(listener);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.dispatch("close", { code: 1000, reason: "", wasClean: true });
  }

  emitJson(message: WorkflowDetailRealtimeServerMessage | Readonly<Record<string, unknown>>): void {
    this.dispatch("message", { data: JSON.stringify(message) });
  }

  emitJsonMessages(
    messages: ReadonlyArray<WorkflowDetailRealtimeServerMessage | Readonly<Record<string, unknown>>>,
  ): void {
    for (const message of messages) {
      this.emitJson(message);
    }
  }

  private dispatch(type: string, event: unknown): void {
    for (const listener of this.listenersByType.get(type) ?? []) {
      listener(event);
    }
  }
}

export class WorkflowDetailTestEnvironment {
  readonly callsByRoute = new Map<string, number>();
  readonly requestBodiesByRoute = new Map<string, unknown[]>();
  readonly socketConnections: WorkflowDetailSocketConnection[] = [];
  readonly workflowRuns: RunSummary[] = [];
  readonly runsById = new Map<string, PersistedRunState>();
  readonly queuedRunResponses: PersistedRunState[] = [];
  private deferredRunResponseResolver: (() => void) | null = null;
  private deferredRunResponsePromise: Promise<void> | null = null;
  debuggerOverlay: WorkflowDebuggerOverlayState;
  readonly websocketPort = "31337";
  private workflowResponse: WorkflowDto;
  private priorFetch: typeof globalThis.fetch | undefined;
  private priorWebSocket: typeof WebSocket | undefined;
  private priorDomMatrixReadOnly: typeof window.DOMMatrixReadOnly | undefined;

  constructor(public readonly workflow: WorkflowDto) {
    this.workflowResponse = workflow;
    this.debuggerOverlay = WorkflowDetailFixtureFactory.createDebuggerOverlayState(workflow.id);
  }

  /**
   * Mirrors {@link reduceWorkflowEventIntoPersistedRunState} into the synthetic fetch store so GET /api/runs/:id
   * stays consistent with the client cache when Vitest simulates websocket events (TanStack Query may refetch).
   */
  recordSimulatedRealtimeServerMessage(
    message: WorkflowDetailRealtimeServerMessage | Readonly<Record<string, unknown>>,
  ): void {
    if (typeof message !== "object" || message === null || !("kind" in message) || message.kind !== "event") {
      return;
    }
    if (!("event" in message) || typeof message.event !== "object" || message.event === null) {
      return;
    }
    const event = message.event as WorkflowEvent;
    if (typeof event.runId !== "string") {
      return;
    }
    const current = this.runsById.get(event.runId);
    const next = reduceWorkflowEventIntoPersistedRunState(current, event);
    this.runsById.set(event.runId, next);
    this.prependWorkflowRun(next);
  }

  install(): void {
    const socketConnections = this.socketConnections;

    this.priorFetch = globalThis.fetch;
    globalThis.fetch = this.handleRequest.bind(this) as typeof fetch;

    this.priorWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = class WorkflowRealtimeSocketMock {
      static readonly CONNECTING = 0;
      static readonly OPEN = 1;
      static readonly CLOSING = 2;
      static readonly CLOSED = 3;

      readonly connection: WorkflowDetailSocketConnection;
      readonly url: string;
      readonly readyState: number;

      constructor(url: string | URL) {
        this.connection = new WorkflowDetailSocketConnection(url);
        this.url = this.connection.url;
        this.readyState = this.connection.readyState;
        socketConnections.push(this.connection);
      }

      addEventListener(type: string, listener: (event: unknown) => void): void {
        this.connection.addEventListener(type, listener);
      }

      removeEventListener(type: string, listener: (event: unknown) => void): void {
        this.connection.removeEventListener(type, listener);
      }

      send(data: string): void {
        this.connection.send(data);
      }

      close(): void {
        this.connection.close();
      }
    } as unknown as typeof WebSocket;

    this.priorDomMatrixReadOnly = window.DOMMatrixReadOnly;
    Object.defineProperty(window, "DOMMatrixReadOnly", {
      configurable: true,
      writable: true,
      value: class {
        constructor() {}
        inverse(): this {
          return this;
        }
        multiply(): this {
          return this;
        }
        translate(): this {
          return this;
        }
        scale(): this {
          return this;
        }
      },
    });
  }

  restore(): void {
    if (this.priorFetch !== undefined) {
      globalThis.fetch = this.priorFetch;
    }
    if (this.priorWebSocket !== undefined) {
      globalThis.WebSocket = this.priorWebSocket;
    }
    if (this.priorDomMatrixReadOnly !== undefined) {
      Object.defineProperty(window, "DOMMatrixReadOnly", {
        configurable: true,
        writable: true,
        value: this.priorDomMatrixReadOnly,
      });
    } else {
      Reflect.deleteProperty(window, "DOMMatrixReadOnly");
    }
    this.priorFetch = undefined;
    this.priorWebSocket = undefined;
    this.priorDomMatrixReadOnly = undefined;
    this.callsByRoute.clear();
    this.requestBodiesByRoute.clear();
    this.socketConnections.length = 0;
    this.workflowRuns.length = 0;
    this.runsById.clear();
    this.queuedRunResponses.length = 0;
    this.deferredRunResponseResolver = null;
    this.deferredRunResponsePromise = null;
    this.workflowResponse = this.workflow;
    this.debuggerOverlay = WorkflowDetailFixtureFactory.createDebuggerOverlayState(this.workflow.id);
  }

  setWorkflowResponse(workflow: WorkflowDto): void {
    this.workflowResponse = workflow;
  }

  queueRunResponse(state: PersistedRunState): void {
    this.queuedRunResponses.push(state);
  }

  seedRun(state: PersistedRunState): void {
    this.runsById.set(state.runId, state);
    this.prependWorkflowRun(state);
  }

  deferNextRunResponse(): void {
    if (this.deferredRunResponsePromise) {
      throw new Error("Expected no deferred run response to already be active.");
    }
    this.deferredRunResponsePromise = new Promise<void>((resolve) => {
      this.deferredRunResponseResolver = resolve;
    });
  }

  releaseDeferredRunResponse(): void {
    this.deferredRunResponseResolver?.();
    this.deferredRunResponseResolver = null;
    this.deferredRunResponsePromise = null;
  }

  latestSocket(): WorkflowDetailSocketConnection {
    const latestConnection = this.socketConnections.at(-1);
    if (!latestConnection) {
      throw new Error("Expected a workflow realtime socket to be created.");
    }
    return latestConnection;
  }

  /**
   * When multiple mock sockets exist (e.g. reconnect or StrictMode), the active client may not be the
   * last pushed connection. Prefer the most recent socket that sent subscribe for this workflow.
   */
  resolveSocketThatSubscribedToWorkflow(workflowId: string): WorkflowDetailSocketConnection {
    const subscribeJson = JSON.stringify({ kind: "subscribe", roomId: workflowId });
    const subscribed = this.socketConnections.filter((c) => c.sentMessages.includes(subscribeJson));
    if (subscribed.length > 0) {
      return subscribed.at(-1)!;
    }
    return this.latestSocket();
  }

  expectCallCount(route: string, expectedCount: number): void {
    expect(this.callsByRoute.get(route) ?? 0).toBe(expectedCount);
  }

  latestRequestBody<TBody>(route: string): TBody {
    const bodies = this.requestBodiesByRoute.get(route) ?? [];
    const latestBody = bodies.at(-1);
    if (!latestBody) {
      throw new Error(`Expected a recorded request body for ${route}.`);
    }
    return latestBody as TBody;
  }

  latestRequestBodyMatching<TBody>(pattern: RegExp): TBody {
    const matchingRoute = [...this.requestBodiesByRoute.keys()].reverse().find((route) => pattern.test(route));
    if (!matchingRoute) {
      throw new Error(`Expected a recorded request body matching ${String(pattern)}.`);
    }
    return this.latestRequestBody<TBody>(matchingRoute);
  }

  private async handleRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    if (init?.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
      window.location.origin,
    );
    const method = (init?.method ?? "GET").toUpperCase();
    const routeKey = `${method} ${url.pathname}`;
    this.callsByRoute.set(routeKey, (this.callsByRoute.get(routeKey) ?? 0) + 1);
    this.recordRequestBody(routeKey, init?.body);

    if (method === "GET" && url.pathname === ApiPaths.workflow(this.workflow.id)) {
      return Response.json(this.workflowResponse);
    }

    if (method === "GET" && url.pathname === ApiPaths.workflowRuns(this.workflow.id)) {
      return Response.json(this.workflowRuns);
    }

    if (method === "GET" && url.pathname === ApiPaths.workflowDebuggerOverlay(this.workflow.id)) {
      return Response.json(this.debuggerOverlay);
    }

    if (method === "GET" && url.pathname.startsWith("/api/runs/")) {
      const runId = decodeURIComponent(url.pathname.split("/")[3] ?? "");
      const runState = this.runsById.get(runId);
      if (!runState) {
        throw new Error(`Unhandled run lookup: ${routeKey}`);
      }
      return Response.json(runState);
    }

    if (method === "POST" && url.pathname === ApiPaths.runs()) {
      return this.handleRunWorkflowRequest(routeKey);
    }

    if (method === "PUT" && url.pathname === ApiPaths.workflowDebuggerOverlay(this.workflow.id)) {
      return this.handleDebuggerOverlayRequest(routeKey);
    }

    if (method === "POST" && url.pathname === ApiPaths.workflowDebuggerOverlayCopyRun(this.workflow.id)) {
      return this.handleDebuggerOverlayCopyRequest(routeKey);
    }

    if (method === "POST" && url.pathname.includes("/nodes/") && url.pathname.endsWith("/run")) {
      return this.handleRunNodeRequest(routeKey);
    }

    if (method === "PATCH" && url.pathname.includes("/nodes/") && url.pathname.endsWith("/pin")) {
      return this.handlePinNodeRequest(url);
    }

    if (method === "PATCH" && url.pathname.includes("/workflow-snapshot")) {
      return this.handleWorkflowSnapshotRequest(routeKey, url);
    }

    if (method === "GET" && url.pathname === ApiPaths.credentialInstances()) {
      return Response.json([]);
    }

    if (method === "GET" && url.pathname === ApiPaths.workflowCredentialHealth(this.workflow.id)) {
      return Response.json({
        workflowId: this.workflow.id,
        slots: [],
      });
    }

    if (method === "PUT" && url.pathname === ApiPaths.credentialBindings()) {
      return Response.json({ ok: true });
    }

    throw new Error(`Unhandled fetch request: ${routeKey}`);
  }

  private async handleRunWorkflowRequest(routeKey: string): Promise<Response> {
    const requestBody = this.latestRequestBody<WorkflowRunRequestBody>(routeKey);
    await this.waitForDeferredRunResponse();
    const runState =
      this.queuedRunResponses.shift() ??
      WorkflowDetailFixtureFactory.createInitialRunState({
        mode: requestBody.mode,
        runId: WorkflowDetailFixtureFactory.runId,
        workflow: this.workflowResponse,
      });
    this.runsById.set(runState.runId, runState);
    this.prependWorkflowRun(runState);
    return Response.json({
      runId: runState.runId,
      workflowId: this.workflow.id,
      status: "pending",
      startedAt: WorkflowDetailFixtureFactory.startedAt,
      state: runState,
    });
  }

  private handleRunNodeRequest(routeKey: string): Response {
    const requestBody = this.latestRequestBody<WorkflowNodeRunRequestBody>(routeKey);
    const runId = WorkflowDetailFixtureFactory.createDerivedRunId();
    const runState = WorkflowDetailFixtureFactory.createInitialRunState({
      mode: requestBody.mode ?? "manual",
      runId,
      workflow: this.workflowResponse,
    });
    this.runsById.set(runId, runState);
    this.prependWorkflowRun(runState);
    return Response.json({
      runId,
      workflowId: this.workflow.id,
      status: "pending",
      startedAt: WorkflowDetailFixtureFactory.startedAt,
      state: runState,
    });
  }

  private handlePinNodeRequest(url: URL): Response {
    const runId = decodeURIComponent(url.pathname.split("/")[3] ?? WorkflowDetailFixtureFactory.runId);
    const nodeId = decodeURIComponent(url.pathname.split("/")[5] ?? WorkflowDetailFixtureFactory.triggerNodeId);
    const runState = WorkflowDetailFixtureFactory.createPinnedMutableRunStateForNode(nodeId, {
      runId,
      workflow: this.workflowResponse,
    });
    this.runsById.set(runId, runState);
    this.prependWorkflowRun(runState);
    return Response.json(runState);
  }

  private handleWorkflowSnapshotRequest(routeKey: string, url: URL): Response {
    const runId = decodeURIComponent(url.pathname.split("/")[3] ?? WorkflowDetailFixtureFactory.runId);
    const requestBody = this.latestRequestBody<WorkflowSnapshotRequestBody>(routeKey);
    const runState = {
      ...WorkflowDetailFixtureFactory.createInitialRunState({
        mode: "manual",
        runId,
        workflow: this.workflowResponse,
      }),
      workflowSnapshot: requestBody.workflowSnapshot,
    };
    this.runsById.set(runId, runState);
    this.prependWorkflowRun(runState);
    return Response.json(runState);
  }

  private handleDebuggerOverlayRequest(routeKey: string): Response {
    const requestBody = this.latestRequestBody<WorkflowDebuggerOverlayRequestBody>(routeKey);
    this.debuggerOverlay = {
      workflowId: this.workflow.id,
      updatedAt: WorkflowDetailFixtureFactory.startedAt,
      copiedFromRunId: this.debuggerOverlay.copiedFromRunId,
      currentState:
        requestBody.currentState ??
        WorkflowDetailFixtureFactory.createDebuggerOverlayState(this.workflowResponse.id).currentState,
    };
    return Response.json(this.debuggerOverlay);
  }

  private handleDebuggerOverlayCopyRequest(routeKey: string): Response {
    const requestBody = this.latestRequestBody<WorkflowDebuggerOverlayCopyRequestBody>(routeKey);
    const sourceRunId = requestBody.sourceRunId ?? WorkflowDetailFixtureFactory.runId;
    const sourceRun =
      this.runsById.get(sourceRunId) ??
      WorkflowDetailFixtureFactory.createCompletedRunState({ runId: sourceRunId, workflow: this.workflowResponse });
    this.runsById.set(sourceRun.runId, sourceRun);
    this.prependWorkflowRun(sourceRun);
    this.debuggerOverlay = {
      workflowId: this.workflow.id,
      updatedAt: WorkflowDetailFixtureFactory.startedAt,
      copiedFromRunId: sourceRun.runId,
      currentState: {
        outputsByNode: sourceRun.outputsByNode,
        nodeSnapshotsByNodeId: sourceRun.nodeSnapshotsByNodeId,
        mutableState: {
          nodesById: Object.fromEntries(
            Object.keys(sourceRun.outputsByNode).map((nodeId) => [
              nodeId,
              {
                pinnedOutputsByPort: undefined,
              },
            ]),
          ),
        },
      },
    };
    return Response.json(this.debuggerOverlay);
  }

  private prependWorkflowRun(runState: PersistedRunState): void {
    const runSummary: RunSummary = {
      runId: runState.runId,
      workflowId: runState.workflowId,
      startedAt: runState.startedAt,
      status: runState.status,
      finishedAt: RunFinishedAtFactory.resolveIso(runState),
      executionOptions: runState.executionOptions,
      parent: runState.parent,
    };
    const existingIndex = this.workflowRuns.findIndex((entry) => entry.runId === runSummary.runId);
    if (existingIndex >= 0) {
      this.workflowRuns[existingIndex] = runSummary;
      return;
    }
    this.workflowRuns.unshift(runSummary);
  }

  private recordRequestBody(routeKey: string, body: RequestInit["body"] | null | undefined): void {
    if (typeof body !== "string") {
      return;
    }
    const bodies = this.requestBodiesByRoute.get(routeKey) ?? [];
    bodies.push(JSON.parse(body));
    this.requestBodiesByRoute.set(routeKey, bodies);
  }

  private async waitForDeferredRunResponse(): Promise<void> {
    const deferredRunResponsePromise = this.deferredRunResponsePromise;
    if (!deferredRunResponsePromise) {
      return;
    }
    await deferredRunResponsePromise;
  }
}
