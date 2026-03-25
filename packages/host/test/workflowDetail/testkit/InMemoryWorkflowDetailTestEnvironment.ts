import { RunFinishedAtFactory } from "@codemation/core";

import type {
  PersistedRunState,
  RunSummary,
  WorkflowDebuggerOverlayState,
} from "@codemation/next-host/src/features/workflows/hooks/realtime/realtime";
import path from "node:path";
import { expect } from "vitest";
import { WebSocket as NodeWebSocket, type RawData } from "ws";
import { ApiPaths } from "../../../src/presentation/http/ApiPaths";
import {
  FrontendHttpIntegrationHarness,
  type FrontendHttpIntegrationRequest,
} from "../../http/testkit/FrontendHttpIntegrationHarness";
import type { WorkflowDetailRuntimeFixture } from "./WorkflowDetailRuntimeFixtures";

type RunCommandResponse = Readonly<{
  runId: string;
  workflowId: string;
  startedAt: string;
  status: PersistedRunState["status"];
  state?: PersistedRunState;
}>;

class WorkflowRealtimeBridgeClient {
  private readonly socket: NodeWebSocket;
  private readonly connections = new Set<WorkflowRealtimeMockSocket>();
  private opened = false;

  constructor(port: number) {
    this.socket = new NodeWebSocket(`ws://127.0.0.1:${String(port)}${ApiPaths.workflowWebsocket()}`);
    this.socket.on("open", () => {
      this.opened = true;
      for (const connection of this.connections) {
        queueMicrotask(() => {
          if (this.connections.has(connection)) {
            connection.handleOpen();
          }
        });
      }
    });
    this.socket.on("message", (rawData) => {
      const message = this.toMessageData(rawData);
      for (const connection of this.connections) {
        connection.handleMessage(message);
      }
    });
    this.socket.on("close", (code, reason) => {
      this.opened = false;
      for (const connection of this.connections) {
        connection.handleClose(code, reason.toString(), true);
      }
    });
    this.socket.on("error", () => {
      for (const connection of this.connections) {
        connection.handleError();
      }
    });
  }

  async open(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      this.socket.once("open", () => resolve());
      this.socket.once("error", reject);
    });
  }

  registerConnection(connection: WorkflowRealtimeMockSocket): void {
    this.connections.add(connection);
    if (this.opened) {
      queueMicrotask(() => {
        if (this.connections.has(connection)) {
          connection.handleOpen();
        }
      });
    }
  }

  unregisterConnection(connection: WorkflowRealtimeMockSocket): void {
    this.connections.delete(connection);
  }

  send(data: string): void {
    this.socket.send(data);
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => {
      this.socket.once("close", () => resolve());
      this.socket.close();
    });
  }

  private toMessageData(data: RawData): string {
    if (typeof data === "string") {
      return data;
    }
    if (data instanceof ArrayBuffer) {
      return Buffer.from(data).toString("utf8");
    }
    if (Array.isArray(data)) {
      return Buffer.concat(
        data.map((entry) => (typeof entry === "string" ? Buffer.from(entry) : Buffer.from(entry))),
      ).toString("utf8");
    }
    return Buffer.from(data).toString("utf8");
  }
}

class WorkflowRealtimeMockSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly url: string;
  private readonly listenersByType = new Map<string, Set<(event: unknown) => void>>();
  private readyStateValue = WorkflowRealtimeMockSocket.CONNECTING;

  constructor(
    url: string | URL,
    private readonly bridgeClient: WorkflowRealtimeBridgeClient,
  ) {
    this.url = String(url);
    this.bridgeClient.registerConnection(this);
  }

  get readyState(): number {
    return this.readyStateValue;
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
    this.bridgeClient.send(data);
  }

  close(code?: number, reason?: string): void {
    this.readyStateValue = WorkflowRealtimeMockSocket.CLOSING;
    this.bridgeClient.unregisterConnection(this);
    this.handleClose(code ?? 1000, reason ?? "", true);
  }

  handleOpen(): void {
    this.readyStateValue = WorkflowRealtimeMockSocket.OPEN;
    this.dispatch("open", new Event("open"));
  }

  handleMessage(data: string): void {
    this.dispatch("message", { data });
  }

  handleError(): void {
    this.dispatch("error", new Event("error"));
  }

  handleClose(code: number, reason: string, wasClean: boolean): void {
    this.readyStateValue = WorkflowRealtimeMockSocket.CLOSED;
    this.dispatch("close", { code, reason, wasClean });
  }

  private dispatch(type: string, event: unknown): void {
    for (const listener of this.listenersByType.get(type) ?? []) {
      listener(event);
    }
  }
}

export class InMemoryWorkflowDetailTestEnvironment {
  readonly callsByRoute = new Map<string, number>();
  readonly requestBodiesByRoute = new Map<string, unknown[]>();
  readonly workflowRuns: RunSummary[] = [];
  readonly runsById = new Map<string, PersistedRunState>();

  private readonly harness: FrontendHttpIntegrationHarness;
  private debuggerOverlay: WorkflowDebuggerOverlayState;
  private websocketPortValue: string | null = null;
  private realtimeBridgeClient: WorkflowRealtimeBridgeClient | null = null;
  private priorFetch: typeof globalThis.fetch | undefined;
  private priorWebSocket: typeof WebSocket | undefined;
  private priorDomMatrixReadOnly: typeof window.DOMMatrixReadOnly | undefined;

  constructor(public readonly fixture: WorkflowDetailRuntimeFixture) {
    this.harness = new FrontendHttpIntegrationHarness({
      config: fixture.config,
      consumerRoot: path.resolve(import.meta.dirname, "../../../../.."),
    });
    this.debuggerOverlay = this.createEmptyOverlay();
  }

  get workflow() {
    return this.fixture.workflow;
  }

  get websocketPort(): string {
    if (!this.websocketPortValue) {
      throw new Error(
        "InMemoryWorkflowDetailTestEnvironment.install() must be called before reading the websocket port.",
      );
    }
    return this.websocketPortValue;
  }

  async install(): Promise<void> {
    await this.harness.start();
    this.websocketPortValue = String(this.harness.getWorkflowWebsocketPort());
    this.realtimeBridgeClient = new WorkflowRealtimeBridgeClient(this.harness.getWorkflowWebsocketPort());
    await this.realtimeBridgeClient.open();
    this.priorFetch = globalThis.fetch;
    globalThis.fetch = this.handleRequest.bind(this) as typeof fetch;
    this.priorWebSocket = globalThis.WebSocket;
    globalThis.WebSocket = this.createWebSocketMockConstructor();
    this.priorDomMatrixReadOnly = window.DOMMatrixReadOnly;
    this.installDomMatrixReadOnly();
  }

  async restore(): Promise<void> {
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
    if (this.realtimeBridgeClient) {
      await this.realtimeBridgeClient.close();
      this.realtimeBridgeClient = null;
    }
    await this.harness.close();
    this.callsByRoute.clear();
    this.requestBodiesByRoute.clear();
    this.workflowRuns.length = 0;
    this.runsById.clear();
    this.debuggerOverlay = this.createEmptyOverlay();
    this.websocketPortValue = null;
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

  async waitForRunToComplete(runId: string): Promise<PersistedRunState> {
    const deadline = performance.now() + 5_000;
    while (performance.now() < deadline) {
      const state = await this.loadRunState(runId);
      if (state.status === "completed" || state.status === "failed") {
        return state;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    throw new Error(`Run ${runId} did not complete before the timeout elapsed.`);
  }

  async loadRunState(runId: string): Promise<PersistedRunState> {
    const response = await this.harness.request({
      method: "GET",
      url: ApiPaths.runState(runId),
    });
    if (response.statusCode !== 200) {
      throw new Error(`Expected run ${runId} to exist but received ${response.statusCode}.`);
    }
    const state = response.json<PersistedRunState>();
    this.runsById.set(state.runId, state);
    this.upsertRunSummaryFromState(state);
    return state;
  }

  async loadWorkflowRuns(): Promise<ReadonlyArray<RunSummary>> {
    const response = await this.harness.request({
      method: "GET",
      url: ApiPaths.workflowRuns(this.workflow.id),
    });
    const runs = response.json<ReadonlyArray<RunSummary>>();
    this.workflowRuns.splice(0, this.workflowRuns.length, ...runs);
    return runs;
  }

  private async handleRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = this.resolveUrl(input);
    const method = this.resolveMethod(input, init);
    const routeKey = `${method} ${url.pathname}`;
    this.callsByRoute.set(routeKey, (this.callsByRoute.get(routeKey) ?? 0) + 1);
    const requestBody = await this.resolveRequestBody(input, init);
    this.recordRequestBody(routeKey, requestBody);
    const response = await this.harness.request({
      method,
      url: `${url.pathname}${url.search}`,
      headers: this.resolveHeaders(input, init),
      payload: requestBody,
    });
    this.captureResponseState(routeKey, response.body);
    return new Response(response.body, {
      status: response.statusCode,
      headers: this.createResponseHeaders(response),
    });
  }

  private resolveUrl(input: RequestInfo | URL): URL {
    if (typeof input === "string") {
      return new URL(input, window.location.origin);
    }
    if (input instanceof URL) {
      return new URL(input.href, window.location.origin);
    }
    return new URL(input.url, window.location.origin);
  }

  private resolveMethod(input: RequestInfo | URL, init?: RequestInit): FrontendHttpIntegrationRequest["method"] {
    const requestMethod = input instanceof Request ? input.method : undefined;
    const method = (init?.method ?? requestMethod ?? "GET").toUpperCase();
    if (method === "GET" || method === "POST" || method === "PUT" || method === "PATCH" || method === "DELETE") {
      return method;
    }
    throw new Error(`Unsupported request method for workflow detail test environment: ${method}`);
  }

  private async resolveRequestBody(input: RequestInfo | URL, init?: RequestInit): Promise<string | undefined> {
    if (typeof init?.body === "string") {
      return init.body;
    }
    if (input instanceof Request) {
      const body = await input.clone().text();
      return body.length > 0 ? body : undefined;
    }
    return undefined;
  }

  private resolveHeaders(input: RequestInfo | URL, init?: RequestInit): Readonly<Record<string, string>> | undefined {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    const initHeaders = new Headers(init?.headers);
    initHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
    const entries: Array<readonly [string, string]> = [];
    headers.forEach((value, key) => {
      entries.push([key, value] as const);
    });
    if (entries.length === 0) {
      return undefined;
    }
    return Object.fromEntries(entries);
  }

  private captureResponseState(routeKey: string, responseBody: string): void {
    if (routeKey === `GET ${ApiPaths.workflowDebuggerOverlay(this.workflow.id)}`) {
      this.debuggerOverlay = JSON.parse(responseBody) as WorkflowDebuggerOverlayState;
      return;
    }
    if (routeKey === `PUT ${ApiPaths.workflowDebuggerOverlay(this.workflow.id)}`) {
      this.debuggerOverlay = JSON.parse(responseBody) as WorkflowDebuggerOverlayState;
      return;
    }
    if (routeKey === `POST ${ApiPaths.workflowDebuggerOverlayCopyRun(this.workflow.id)}`) {
      this.debuggerOverlay = JSON.parse(responseBody) as WorkflowDebuggerOverlayState;
      return;
    }
    if (routeKey === `GET ${ApiPaths.workflowRuns(this.workflow.id)}`) {
      const runs = JSON.parse(responseBody) as ReadonlyArray<RunSummary>;
      this.workflowRuns.splice(0, this.workflowRuns.length, ...runs);
      return;
    }
    if (routeKey === `POST ${ApiPaths.runs()}`) {
      const createdRun = JSON.parse(responseBody) as RunCommandResponse;
      this.upsertRunSummary({
        runId: createdRun.runId,
        workflowId: createdRun.workflowId,
        startedAt: createdRun.startedAt,
        status: createdRun.status,
      });
      if (createdRun.state) {
        this.runsById.set(createdRun.state.runId, createdRun.state);
      }
      return;
    }
    if (routeKey.startsWith(`GET ${ApiPaths.runs()}/`)) {
      const state = JSON.parse(responseBody) as PersistedRunState;
      this.runsById.set(state.runId, state);
      this.upsertRunSummaryFromState(state);
      return;
    }
    if (routeKey.startsWith(`PATCH ${ApiPaths.runs()}/`) || routeKey.startsWith(`POST ${ApiPaths.runs()}/`)) {
      const maybeState = this.tryParseRunState(responseBody);
      if (maybeState) {
        this.runsById.set(maybeState.runId, maybeState);
        this.upsertRunSummaryFromState(maybeState);
      }
    }
  }

  private tryParseRunState(responseBody: string): PersistedRunState | undefined {
    if (!responseBody) {
      return undefined;
    }
    const parsed = JSON.parse(responseBody) as Partial<PersistedRunState>;
    if (
      !parsed ||
      typeof parsed.runId !== "string" ||
      typeof parsed.workflowId !== "string" ||
      typeof parsed.startedAt !== "string"
    ) {
      return undefined;
    }
    return parsed as PersistedRunState;
  }

  private upsertRunSummaryFromState(state: PersistedRunState): void {
    this.upsertRunSummary({
      runId: state.runId,
      workflowId: state.workflowId,
      startedAt: state.startedAt,
      status: state.status,
      finishedAt: RunFinishedAtFactory.resolveIso(state),
      parent: state.parent,
      executionOptions: state.executionOptions,
    });
  }

  private upsertRunSummary(summary: RunSummary): void {
    const existingIndex = this.workflowRuns.findIndex((entry) => entry.runId === summary.runId);
    if (existingIndex >= 0) {
      this.workflowRuns[existingIndex] = summary;
      return;
    }
    this.workflowRuns.unshift(summary);
  }

  private createResponseHeaders(response: {
    header: (name: string) => string | string[] | number | undefined;
  }): Headers {
    const headers = new Headers();
    for (const headerName of ["content-type", "location"]) {
      const value = response.header(headerName);
      if (typeof value === "string") {
        headers.set(headerName, value);
      }
    }
    return headers;
  }

  private recordRequestBody(routeKey: string, requestBody: string | undefined): void {
    if (!requestBody) {
      return;
    }
    const bodies = this.requestBodiesByRoute.get(routeKey) ?? [];
    bodies.push(JSON.parse(requestBody));
    this.requestBodiesByRoute.set(routeKey, bodies);
  }

  private installDomMatrixReadOnly(): void {
    Object.defineProperty(window, "DOMMatrixReadOnly", {
      configurable: true,
      writable: true,
      value: class {
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

  private createEmptyOverlay(): WorkflowDebuggerOverlayState {
    return {
      workflowId: this.workflow.id,
      updatedAt: "2026-03-17T00:00:00.000Z",
      currentState: {
        outputsByNode: {},
        nodeSnapshotsByNodeId: {},
        mutableState: {
          nodesById: {},
        },
      },
    };
  }

  private createWebSocketMockConstructor(): typeof WebSocket {
    const bridgeClient = this.requireRealtimeBridgeClient();
    return class WorkflowRealtimeSocketMock {
      static readonly CONNECTING = WorkflowRealtimeMockSocket.CONNECTING;
      static readonly OPEN = WorkflowRealtimeMockSocket.OPEN;
      static readonly CLOSING = WorkflowRealtimeMockSocket.CLOSING;
      static readonly CLOSED = WorkflowRealtimeMockSocket.CLOSED;

      private readonly connection: WorkflowRealtimeMockSocket;
      readonly url: string;

      constructor(url: string | URL) {
        this.connection = new WorkflowRealtimeMockSocket(url, bridgeClient);
        this.url = this.connection.url;
      }

      get readyState(): number {
        return this.connection.readyState;
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

      close(code?: number, reason?: string): void {
        this.connection.close(code, reason);
      }
    } as unknown as typeof WebSocket;
  }

  private requireRealtimeBridgeClient(): WorkflowRealtimeBridgeClient {
    if (!this.realtimeBridgeClient) {
      throw new Error(
        "InMemoryWorkflowDetailTestEnvironment.install() must initialize the realtime bridge client before creating websocket mocks.",
      );
    }
    return this.realtimeBridgeClient;
  }
}
