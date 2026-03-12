import { vi, expect } from "vitest";
import type { PersistedRunState, RunSummary, WorkflowDto } from "../../../src/client";
import type { WorkflowDetailRealtimeServerMessage } from "./WorkflowDetailRealtimeFixtures";
import { WorkflowDetailFixtureFactory } from "./WorkflowDetailFixtures";

type WorkflowRunRequestBody = Readonly<{
  workflowId: string;
  items: ReadonlyArray<Readonly<{ json: unknown }>>;
  stopAt?: string;
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

  emitJsonMessages(messages: ReadonlyArray<WorkflowDetailRealtimeServerMessage | Readonly<Record<string, unknown>>>): void {
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
  readonly websocketPort = "31337";

  constructor(public readonly workflow: WorkflowDto) {}

  install(): void {
    const environment = this;

    vi.stubGlobal("fetch", this.handleRequest.bind(this) as typeof fetch);

    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: class WorkflowRealtimeSocketMock {
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
          environment.socketConnections.push(this.connection);
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
      },
    });

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
    vi.unstubAllGlobals();
    this.callsByRoute.clear();
    this.requestBodiesByRoute.clear();
    this.socketConnections.length = 0;
    this.workflowRuns.length = 0;
    this.runsById.clear();
  }

  latestSocket(): WorkflowDetailSocketConnection {
    const latestConnection = this.socketConnections.at(-1);
    if (!latestConnection) {
      throw new Error("Expected a workflow realtime socket to be created.");
    }
    return latestConnection;
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
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    const method = (init?.method ?? "GET").toUpperCase();
    const routeKey = `${method} ${url.pathname}`;
    this.callsByRoute.set(routeKey, (this.callsByRoute.get(routeKey) ?? 0) + 1);
    this.recordRequestBody(routeKey, init?.body);

    if (method === "POST" && url.pathname === "/api/realtime/ready") {
      return Response.json({ ok: true, websocketPort: this.websocketPort });
    }

    if (method === "GET" && url.pathname === `/api/workflows/${encodeURIComponent(this.workflow.id)}/runs`) {
      return Response.json(this.workflowRuns);
    }

    if (method === "GET" && url.pathname.startsWith("/api/runs/")) {
      const runId = decodeURIComponent(url.pathname.split("/")[3] ?? "");
      const runState = this.runsById.get(runId);
      if (!runState) {
        throw new Error(`Unhandled run lookup: ${routeKey}`);
      }
      return Response.json(runState);
    }

    if (method === "POST" && url.pathname === "/api/run") {
      return this.handleRunWorkflowRequest(routeKey);
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

    throw new Error(`Unhandled fetch request: ${routeKey}`);
  }

  private handleRunWorkflowRequest(routeKey: string): Response {
    const requestBody = this.latestRequestBody<WorkflowRunRequestBody>(routeKey);
    const runState = WorkflowDetailFixtureFactory.createInitialRunState({
      mode: requestBody.mode,
      runId: WorkflowDetailFixtureFactory.runId,
      workflow: this.workflow,
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
      workflow: this.workflow,
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
      workflow: this.workflow,
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
        workflow: this.workflow,
      }),
      workflowSnapshot: requestBody.workflowSnapshot,
    };
    this.runsById.set(runId, runState);
    this.prependWorkflowRun(runState);
    return Response.json(runState);
  }

  private prependWorkflowRun(runState: PersistedRunState): void {
    const runSummary: RunSummary = {
      runId: runState.runId,
      workflowId: runState.workflowId,
      startedAt: runState.startedAt,
      status: runState.status,
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
}
