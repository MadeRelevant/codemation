import { act, cleanup, fireEvent, render, screen, waitFor, within, type RenderResult } from "@testing-library/react";
import { AgentAttachmentNodeIdFactory, PersistedWorkflowSnapshotFactory, PersistedWorkflowTokenRegistry, WorkflowBuilder, type ChatModelConfig, type ToolConfig } from "@codemation/core";
import { AIAgent, Callback, ManualTrigger, WebhookTrigger } from "@codemation/core-nodes";
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Providers } from "../src/providers/Providers";
import { WorkflowDetailScreen } from "../src/routes/WorkflowDetailScreen";
import type { PersistedRunState, WorkflowDto } from "../src/client";
import { CodemationWorkflowDtoMapper } from "../src/host/codemationWorkflowDtoMapper";

type WorkflowEventMessage = Readonly<{
  kind: "event";
  event:
    | Readonly<{ kind: "runCreated"; runId: string; workflowId: string; at: string }>
    | Readonly<{ kind: "nodeStarted" | "nodeCompleted"; runId: string; workflowId: string; at: string; snapshot: WorkflowSnapshot }>
    | Readonly<{ kind: "runSaved"; runId: string; workflowId: string; at: string; state: PersistedRunState }>;
}>;

type WorkflowSnapshot = PersistedRunState["nodeSnapshotsByNodeId"][string];

class FrontendWorkflowDetailChatModelFactory {}

class FrontendWorkflowDetailTool {}

class FrontendWorkflowDetailChatModelConfig implements ChatModelConfig {
  readonly type = FrontendWorkflowDetailChatModelFactory as ChatModelConfig["type"];

  constructor(
    public readonly name: string,
    public readonly presentation?: ChatModelConfig["presentation"],
  ) {}
}

class FrontendWorkflowDetailToolConfig implements ToolConfig {
  readonly type = FrontendWorkflowDetailTool as ToolConfig["type"];

  constructor(
    public readonly name: string,
    public readonly description?: string,
    public readonly presentation?: ToolConfig["presentation"],
  ) {}
}

class WorkflowDetailFixtureFactory {
  static readonly workflowId = "wf.frontend.realtime";
  static readonly runId = "run_frontend_1";
  static readonly triggerNodeId = "trigger";
  static readonly nodeOneId = "node_1";
  static readonly agentNodeId = "agent";
  static readonly nodeTwoId = "node_2";
  static readonly startedAt = "2026-03-11T12:00:00.000Z";

  static readonly llmNodeId = AgentAttachmentNodeIdFactory.createLanguageModelNodeId(this.agentNodeId);
  static readonly toolNodeId = AgentAttachmentNodeIdFactory.createToolNodeId(this.agentNodeId, "lookup_tool");
  static readonly llmFirstInvocationNodeId = AgentAttachmentNodeIdFactory.createLanguageModelNodeId(this.agentNodeId, 1);
  static readonly llmSecondInvocationNodeId = AgentAttachmentNodeIdFactory.createLanguageModelNodeId(this.agentNodeId, 2);
  static readonly toolFirstInvocationNodeId = AgentAttachmentNodeIdFactory.createToolNodeId(this.agentNodeId, "lookup_tool", 1);

  static createWorkflowDefinition() {
    return new WorkflowBuilder({ id: this.workflowId, name: "Frontend realtime workflow" })
      .trigger(new ManualTrigger("Manual trigger", this.triggerNodeId))
      .then(new Callback("Node 1", undefined, this.nodeOneId))
      .then(
        new AIAgent(
          "Agent",
          "Inspect the item and use the tool when needed.",
          (item) => JSON.stringify(item.json ?? {}),
          new FrontendWorkflowDetailChatModelConfig("Mock LLM", { label: "Mock LLM" }),
          [new FrontendWorkflowDetailToolConfig("lookup_tool", "Lookup tool", { label: "Lookup tool" })],
          this.agentNodeId,
        ),
      )
      .then(new Callback("Node 2", undefined, this.nodeTwoId))
      .build();
  }

  static createWorkflowDetail(): WorkflowDto {
    return new CodemationWorkflowDtoMapper().toDetail(this.createWorkflowDefinition()) as WorkflowDto;
  }

  static createWebhookWorkflowDetail(): WorkflowDto {
    const workflow = new WorkflowBuilder({ id: this.workflowId, name: "Frontend webhook workflow" })
      .trigger(
        new WebhookTrigger(
          "Webhook trigger",
          {
            endpointKey: "incoming",
            methods: ["POST"],
          },
          undefined,
          this.triggerNodeId,
        ),
      )
      .build();

    return new CodemationWorkflowDtoMapper().toDetail(workflow) as WorkflowDto;
  }

  static createInitialRunState(mode?: "manual" | "debug", runId = this.runId): PersistedRunState {
    return {
      runId,
      workflowId: this.workflowId,
      startedAt: this.startedAt,
      executionOptions: mode ? { mode, isMutable: true, sourceWorkflowId: this.workflowId } : undefined,
      workflowSnapshot: this.createWorkflowSnapshot(),
      mutableState: mode ? { nodesById: {} } : undefined,
      status: "pending",
      pending: undefined,
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
    };
  }

  static createCompletedRunState(mode?: "manual" | "debug", runId = this.runId): PersistedRunState {
    return {
      ...this.createInitialRunState(mode, runId),
      status: "completed",
      nodeSnapshotsByNodeId: {
        [this.triggerNodeId]: this.createSnapshot(this.triggerNodeId, "completed", 0, runId),
        [this.nodeOneId]: this.createSnapshot(this.nodeOneId, "completed", 1, runId),
        [this.agentNodeId]: this.createSnapshot(this.agentNodeId, "completed", 2, runId),
        [this.llmFirstInvocationNodeId]: this.createSnapshot(this.llmFirstInvocationNodeId, "completed", 3, runId),
        [this.toolFirstInvocationNodeId]: this.createSnapshot(this.toolFirstInvocationNodeId, "completed", 4, runId),
        [this.llmSecondInvocationNodeId]: this.createSnapshot(this.llmSecondInvocationNodeId, "completed", 5, runId),
        [this.nodeTwoId]: this.createSnapshot(this.nodeTwoId, "completed", 6, runId),
      },
    };
  }

  static createFailedRunState(runId = this.runId): PersistedRunState {
    return {
      ...this.createInitialRunState(undefined, runId),
      status: "failed",
      nodeSnapshotsByNodeId: {
        [this.nodeOneId]: {
          ...this.createSnapshot(this.nodeOneId, "failed", 1, runId),
          error: {
            name: "NodeExecutionError",
            message: "Execution failed while rendering preview output.",
            stack: "Execution failed while rendering preview output.\nReason: upstream API rejected the payload.\nHint: inspect the input tab.",
          },
        },
      },
    };
  }

  static createPinnedMutableRunState(): PersistedRunState {
    return {
      ...this.createCompletedRunState("manual"),
      mutableState: {
        nodesById: {
          [this.triggerNodeId]: {
            pinnedInput: [{ json: { pinned: true } }],
          },
        },
      },
    };
  }

  static createPinnedMutableRunStateForNode(nodeId: string): PersistedRunState {
    return {
      ...this.createCompletedRunState("manual"),
      mutableState: {
        nodesById: {
          [nodeId]: {
            pinnedInput: [{ json: { pinned: true } }],
          },
        },
      },
    };
  }

  static createWorkflowSnapshot(): NonNullable<PersistedRunState["workflowSnapshot"]> {
    const workflow = this.createWorkflowDefinition();
    const tokenRegistry = new PersistedWorkflowTokenRegistry();
    tokenRegistry.registerFromWorkflows([workflow]);
    return new PersistedWorkflowSnapshotFactory(tokenRegistry).create(workflow);
  }

  static createSnapshot(nodeId: string, status: WorkflowSnapshot["status"], step: number, runId = this.runId): WorkflowSnapshot {
    const timestamp = this.timestamp(step);
    return {
      runId,
      workflowId: this.workflowId,
      nodeId,
      status,
      queuedAt: status === "running" ? timestamp : undefined,
      startedAt: status === "running" || status === "completed" ? timestamp : undefined,
      finishedAt: status === "completed" ? timestamp : undefined,
      updatedAt: timestamp,
      inputsByPort: { in: [{ json: this.createStructuredValue(step, "input") }] },
      outputs: status === "completed" ? { main: [{ json: this.createStructuredValue(step, "output") }] } : undefined,
    };
  }

  private static createStructuredValue(step: number, phase: "input" | "output"): Readonly<Record<string, unknown>> {
    return {
      step,
      phase,
      subject: `${phase.toUpperCase()} subject ${step}`,
      body: `Body line 1 (${phase} ${step})\nBody line 2 (${phase} ${step})`,
      metadata: {
        source: "workflow-detail-test",
        phase,
      },
    };
  }

  private static timestamp(step: number): string {
    const second = String(step).padStart(2, "0");
    return `2026-03-11T12:00:${second}.000Z`;
  }
}

class WorkflowFetchMock {
  private static readonly callsByRoute = new Map<string, number>();
  private static readonly requestBodiesByRoute = new Map<string, unknown[]>();

  static install(): void {
    const handler = this.handleRequest.bind(this) as typeof fetch;
    vi.stubGlobal("fetch", handler);
  }

  static restore(): void {
    vi.unstubAllGlobals();
    this.callsByRoute.clear();
    this.requestBodiesByRoute.clear();
  }

  static expectCallCount(route: string, expectedCount: number): void {
    expect(this.callsByRoute.get(route) ?? 0).toBe(expectedCount);
  }

  static latestRequestBody<TBody>(route: string): TBody {
    const bodies = this.requestBodiesByRoute.get(route) ?? [];
    const latest = bodies.at(-1);
    if (!latest) {
      throw new Error(`Expected a recorded request body for ${route}.`);
    }
    return latest as TBody;
  }

  static latestRequestBodyMatching<TBody>(pattern: RegExp): TBody {
    const matchingRoute = [...this.requestBodiesByRoute.keys()].reverse().find((route) => pattern.test(route));
    if (!matchingRoute) {
      throw new Error(`Expected a recorded request body matching ${String(pattern)}.`);
    }
    return this.latestRequestBody<TBody>(matchingRoute);
  }

  private static async handleRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    const method = (init?.method ?? "GET").toUpperCase();
    const routeKey = `${method} ${url.pathname}`;
    this.callsByRoute.set(routeKey, (this.callsByRoute.get(routeKey) ?? 0) + 1);
    if (typeof init?.body === "string") {
      const bodies = this.requestBodiesByRoute.get(routeKey) ?? [];
      bodies.push(JSON.parse(init.body));
      this.requestBodiesByRoute.set(routeKey, bodies);
    }

    if (method === "POST" && url.pathname === "/api/realtime/ready") {
      return Response.json({ ok: true, websocketPort: "31337" });
    }
    if (method === "GET" && url.pathname === `/api/workflows/${encodeURIComponent(WorkflowDetailFixtureFactory.workflowId)}/runs`) {
      return Response.json([]);
    }
    if (method === "POST" && url.pathname === "/api/run") {
      const requestBody = this.latestRequestBody<
        Readonly<{
          workflowId: string;
          items: ReadonlyArray<Readonly<{ json: unknown }>>;
          stopAt?: string;
          mode?: "manual" | "debug";
          sourceRunId?: string;
        }>
      >("POST /api/run");
      return Response.json({
        runId: WorkflowDetailFixtureFactory.runId,
        workflowId: WorkflowDetailFixtureFactory.workflowId,
        status: "pending",
        startedAt: WorkflowDetailFixtureFactory.startedAt,
        state: WorkflowDetailFixtureFactory.createInitialRunState(requestBody.mode),
      });
    }
    if (method === "POST" && url.pathname.startsWith(`/api/runs/${encodeURIComponent(WorkflowDetailFixtureFactory.runId)}/nodes/`) && url.pathname.endsWith("/run")) {
      const requestBody = this.latestRequestBody<Readonly<{ items?: ReadonlyArray<Readonly<{ json: unknown }>>; mode?: "manual" | "debug" }>>(routeKey);
      const derivedRunId = `${WorkflowDetailFixtureFactory.runId}_derived`;
      return Response.json({
        runId: derivedRunId,
        workflowId: WorkflowDetailFixtureFactory.workflowId,
        status: "pending",
        startedAt: WorkflowDetailFixtureFactory.startedAt,
        state: WorkflowDetailFixtureFactory.createInitialRunState(requestBody.mode ?? "manual", derivedRunId),
      });
    }
    if (method === "PATCH" && url.pathname.startsWith(`/api/runs/${encodeURIComponent(WorkflowDetailFixtureFactory.runId)}/nodes/`) && url.pathname.endsWith("/pin")) {
      const nodeId = decodeURIComponent(url.pathname.split("/")[5]!);
      return Response.json(WorkflowDetailFixtureFactory.createPinnedMutableRunStateForNode(nodeId));
    }
    if (method === "PATCH" && url.pathname === `/api/runs/${encodeURIComponent(WorkflowDetailFixtureFactory.runId)}/workflow-snapshot`) {
      return Response.json({
        ...WorkflowDetailFixtureFactory.createInitialRunState("manual"),
        workflowSnapshot: this.latestRequestBody<Readonly<{ workflowSnapshot: PersistedRunState["workflowSnapshot"] }>>(routeKey).workflowSnapshot,
      });
    }

    throw new Error(`Unhandled fetch request: ${routeKey}`);
  }
}

class WorkflowRealtimeSocketMock {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  static readonly instances: WorkflowRealtimeSocketMock[] = [];

  readonly sentMessages: string[] = [];
  readonly url: string;
  readonly readyState = WorkflowRealtimeSocketMock.OPEN;
  private readonly listenersByType = new Map<string, Set<(event: unknown) => void>>();

  constructor(url: string | URL) {
    this.url = String(url);
    WorkflowRealtimeSocketMock.instances.push(this);
    queueMicrotask(() => {
      this.dispatch("open", new Event("open"));
    });
  }

  static install(): void {
    Object.defineProperty(globalThis, "WebSocket", {
      configurable: true,
      writable: true,
      value: WorkflowRealtimeSocketMock,
    });
  }

  static restore(): void {
    WorkflowRealtimeSocketMock.instances.length = 0;
  }

  static latest(): WorkflowRealtimeSocketMock {
    const latestInstance = WorkflowRealtimeSocketMock.instances.at(-1);
    if (!latestInstance) {
      throw new Error("Expected a workflow realtime socket to be created.");
    }
    return latestInstance;
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

  emitJson(message: Readonly<Record<string, unknown>>): void {
    this.dispatch("message", { data: JSON.stringify(message) });
  }

  emitJsonMessages(messages: ReadonlyArray<Readonly<Record<string, unknown>>>): void {
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

class WorkflowCanvasDomMatrixMock {
  static install(): void {
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
}

class WorkflowStatusAssertions {
  static expectNodePresence(container: HTMLElement, nodeIds: ReadonlyArray<string>): void {
    for (const nodeId of nodeIds) {
      const element = container.querySelector<HTMLElement>(`[data-codemation-node-id="${nodeId}"]`);
      expect(element).not.toBeNull();
    }
  }

  static expectStatuses(
    container: HTMLElement,
    expectedByNodeId: Readonly<Record<string, "pending" | "running" | "completed">>,
  ): void {
    for (const [nodeId, status] of Object.entries(expectedByNodeId)) {
      const element = container.querySelector<HTMLElement>(`[data-codemation-node-id="${nodeId}"]`);
      expect(element).not.toBeNull();
      expect(element).toHaveAttribute("data-codemation-node-status", status);
    }
  }
}

class WorkflowExecutionTreeAssertions {
  static expectNodePresence(nodeIds: ReadonlyArray<string>): void {
    for (const nodeId of nodeIds) {
      expect(screen.getByTestId(`execution-tree-node-${nodeId}`)).toBeInTheDocument();
    }
  }
}

class WorkflowDetailTestRenderer {
  static render(workflow: WorkflowDto = WorkflowDetailFixtureFactory.createWorkflowDetail()): RenderResult {
    const rootRoute = createRootRoute({
      component: () => <Outlet />,
    });
    const detailRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/",
      component: () => <WorkflowDetailScreen workflowId={workflow.id} initialWorkflow={workflow} />,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([detailRoute]),
    });

    return render(
      <Providers websocketPort="31337">
        <RouterProvider router={router} />
      </Providers>,
    );
  }
}

class WorkflowRealtimeEventFactory {
  static runCreated(): WorkflowEventMessage {
    return {
      kind: "event",
      event: {
        kind: "runCreated",
        runId: WorkflowDetailFixtureFactory.runId,
        workflowId: WorkflowDetailFixtureFactory.workflowId,
        at: WorkflowDetailFixtureFactory.startedAt,
      },
    };
  }

  static nodeStarted(nodeId: string, step: number): WorkflowEventMessage {
    return {
      kind: "event",
      event: {
        kind: "nodeStarted",
        runId: WorkflowDetailFixtureFactory.runId,
        workflowId: WorkflowDetailFixtureFactory.workflowId,
        at: WorkflowDetailFixtureFactory.createSnapshot(nodeId, "running", step).updatedAt,
        snapshot: WorkflowDetailFixtureFactory.createSnapshot(nodeId, "running", step),
      },
    };
  }

  static nodeCompleted(nodeId: string, step: number): WorkflowEventMessage {
    return {
      kind: "event",
      event: {
        kind: "nodeCompleted",
        runId: WorkflowDetailFixtureFactory.runId,
        workflowId: WorkflowDetailFixtureFactory.workflowId,
        at: WorkflowDetailFixtureFactory.createSnapshot(nodeId, "completed", step).updatedAt,
        snapshot: WorkflowDetailFixtureFactory.createSnapshot(nodeId, "completed", step),
      },
    };
  }

  static runSaved(): WorkflowEventMessage {
    return {
      kind: "event",
      event: {
        kind: "runSaved",
        runId: WorkflowDetailFixtureFactory.runId,
        workflowId: WorkflowDetailFixtureFactory.workflowId,
        at: "2026-03-11T12:00:59.000Z",
        state: WorkflowDetailFixtureFactory.createCompletedRunState(),
      },
    };
  }

  static runSavedFailed(): WorkflowEventMessage {
    return {
      kind: "event",
      event: {
        kind: "runSaved",
        runId: WorkflowDetailFixtureFactory.runId,
        workflowId: WorkflowDetailFixtureFactory.workflowId,
        at: "2026-03-11T12:00:59.000Z",
        state: WorkflowDetailFixtureFactory.createFailedRunState(),
      },
    };
  }
}

class WorkflowStatusClock {
  static async waitForStatusVisibilityWindow(): Promise<void> {
    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
    });
  }
}

describe("WorkflowDetailScreen", () => {
  beforeEach(() => {
    WorkflowFetchMock.install();
    WorkflowRealtimeSocketMock.install();
    WorkflowCanvasDomMatrixMock.install();
  });

  afterEach(() => {
    cleanup();
    WorkflowFetchMock.restore();
    WorkflowRealtimeSocketMock.restore();
  });

  it("applies realtime node status updates for workflow nodes and agent attachments", async () => {
    const renderResult = WorkflowDetailTestRenderer.render();

    await waitFor(() => {
      expect(WorkflowRealtimeSocketMock.instances).toHaveLength(1);
    });

    const socket = WorkflowRealtimeSocketMock.latest();

    await waitFor(() => {
      expect(socket.sentMessages).toContain(JSON.stringify({ kind: "subscribeWorkflow", workflowId: WorkflowDetailFixtureFactory.workflowId }));
    });

    socket.emitJson({ kind: "subscribed", workflowId: WorkflowDetailFixtureFactory.workflowId });

    WorkflowStatusAssertions.expectStatuses(renderResult.container, {
      [WorkflowDetailFixtureFactory.triggerNodeId]: "pending",
      [WorkflowDetailFixtureFactory.nodeOneId]: "pending",
      [WorkflowDetailFixtureFactory.agentNodeId]: "pending",
      [WorkflowDetailFixtureFactory.llmNodeId]: "pending",
      [WorkflowDetailFixtureFactory.toolNodeId]: "pending",
      [WorkflowDetailFixtureFactory.nodeTwoId]: "pending",
    });

    fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));

    await waitFor(() => {
      expect(screen.getByTestId(`run-summary-${WorkflowDetailFixtureFactory.runId}`)).toBeInTheDocument();
    });

    WorkflowFetchMock.expectCallCount("POST /api/realtime/ready", 1);
    WorkflowFetchMock.expectCallCount("GET /api/workflows/wf.frontend.realtime/runs", 1);
    WorkflowFetchMock.expectCallCount("POST /api/run", 1);

    socket.emitJson(WorkflowRealtimeEventFactory.runCreated());
    socket.emitJson(WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.triggerNodeId, 0));

    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(renderResult.container, {
        [WorkflowDetailFixtureFactory.triggerNodeId]: "completed",
        [WorkflowDetailFixtureFactory.nodeOneId]: "pending",
        [WorkflowDetailFixtureFactory.agentNodeId]: "pending",
        [WorkflowDetailFixtureFactory.llmNodeId]: "pending",
        [WorkflowDetailFixtureFactory.toolNodeId]: "pending",
        [WorkflowDetailFixtureFactory.nodeTwoId]: "pending",
      });
    });

    socket.emitJson(WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.nodeOneId, 1));
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(renderResult.container, {
        [WorkflowDetailFixtureFactory.nodeOneId]: "running",
        [WorkflowDetailFixtureFactory.agentNodeId]: "pending",
        [WorkflowDetailFixtureFactory.nodeTwoId]: "pending",
      });
    });

    socket.emitJson(WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.nodeOneId, 1));
    await WorkflowStatusClock.waitForStatusVisibilityWindow();
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(renderResult.container, {
        [WorkflowDetailFixtureFactory.nodeOneId]: "completed",
        [WorkflowDetailFixtureFactory.agentNodeId]: "pending",
        [WorkflowDetailFixtureFactory.nodeTwoId]: "pending",
      });
    });

    socket.emitJson(WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.agentNodeId, 2));
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(renderResult.container, {
        [WorkflowDetailFixtureFactory.agentNodeId]: "running",
        [WorkflowDetailFixtureFactory.llmNodeId]: "pending",
        [WorkflowDetailFixtureFactory.toolNodeId]: "pending",
      });
    });

    socket.emitJson(WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.llmFirstInvocationNodeId, 3));
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(renderResult.container, {
        [WorkflowDetailFixtureFactory.agentNodeId]: "running",
        [WorkflowDetailFixtureFactory.llmNodeId]: "running",
        [WorkflowDetailFixtureFactory.toolNodeId]: "pending",
      });
    });

    socket.emitJson(WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.llmFirstInvocationNodeId, 3));
    await WorkflowStatusClock.waitForStatusVisibilityWindow();
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(renderResult.container, {
        [WorkflowDetailFixtureFactory.agentNodeId]: "running",
        [WorkflowDetailFixtureFactory.llmNodeId]: "completed",
        [WorkflowDetailFixtureFactory.toolNodeId]: "pending",
      });
    });

    socket.emitJson(WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.toolFirstInvocationNodeId, 4));
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(renderResult.container, {
        [WorkflowDetailFixtureFactory.agentNodeId]: "running",
        [WorkflowDetailFixtureFactory.llmNodeId]: "completed",
        [WorkflowDetailFixtureFactory.toolNodeId]: "running",
      });
    });

    socket.emitJson(WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.toolFirstInvocationNodeId, 4));
    await WorkflowStatusClock.waitForStatusVisibilityWindow();
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(renderResult.container, {
        [WorkflowDetailFixtureFactory.agentNodeId]: "running",
        [WorkflowDetailFixtureFactory.llmNodeId]: "completed",
        [WorkflowDetailFixtureFactory.toolNodeId]: "completed",
      });
    });

    socket.emitJson(WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.agentNodeId, 5));
    await WorkflowStatusClock.waitForStatusVisibilityWindow();
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(renderResult.container, {
        [WorkflowDetailFixtureFactory.agentNodeId]: "completed",
        [WorkflowDetailFixtureFactory.llmNodeId]: "completed",
        [WorkflowDetailFixtureFactory.toolNodeId]: "completed",
        [WorkflowDetailFixtureFactory.nodeTwoId]: "pending",
      });
    });

    socket.emitJson(WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.nodeTwoId, 6));
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(renderResult.container, {
        [WorkflowDetailFixtureFactory.nodeTwoId]: "running",
      });
    });

    socket.emitJson(WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.nodeTwoId, 6));
    socket.emitJson(WorkflowRealtimeEventFactory.runSaved());
    await WorkflowStatusClock.waitForStatusVisibilityWindow();

    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(renderResult.container, {
        [WorkflowDetailFixtureFactory.triggerNodeId]: "completed",
        [WorkflowDetailFixtureFactory.nodeOneId]: "completed",
        [WorkflowDetailFixtureFactory.agentNodeId]: "completed",
        [WorkflowDetailFixtureFactory.llmNodeId]: "completed",
        [WorkflowDetailFixtureFactory.toolNodeId]: "completed",
        [WorkflowDetailFixtureFactory.nodeTwoId]: "completed",
      });
      expect(screen.getByTestId(`run-status-${WorkflowDetailFixtureFactory.runId}`)).toHaveTextContent("completed");
      WorkflowExecutionTreeAssertions.expectNodePresence([
        WorkflowDetailFixtureFactory.llmFirstInvocationNodeId,
        WorkflowDetailFixtureFactory.toolFirstInvocationNodeId,
        WorkflowDetailFixtureFactory.llmSecondInvocationNodeId,
      ]);
    });
  });

  it("posts an empty item batch when manually running a webhook-trigger workflow", async () => {
    WorkflowDetailTestRenderer.render(WorkflowDetailFixtureFactory.createWebhookWorkflowDetail());

    await waitFor(() => {
      expect(WorkflowRealtimeSocketMock.instances).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));

    await waitFor(() => {
      expect(screen.getByTestId(`run-summary-${WorkflowDetailFixtureFactory.runId}`)).toBeInTheDocument();
    });

    expect(
      WorkflowFetchMock.latestRequestBody<Readonly<{ workflowId: string; items: ReadonlyArray<Readonly<{ json: unknown }>> }>>("POST /api/run"),
    ).toEqual({
      workflowId: WorkflowDetailFixtureFactory.workflowId,
      items: [],
    });
  });

  it("creates a debug execution when using debug here", async () => {
    WorkflowDetailTestRenderer.render();

    await waitFor(() => {
      expect(WorkflowRealtimeSocketMock.instances).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Debug here" }));

    await waitFor(() => {
      expect(screen.getByTestId(`run-mode-${WorkflowDetailFixtureFactory.runId}`)).toHaveTextContent("Debug");
      expect(screen.getByTestId(`run-summary-${WorkflowDetailFixtureFactory.runId}`)).toBeInTheDocument();
    });

    expect(
      WorkflowFetchMock.latestRequestBody<
        Readonly<{ workflowId: string; mode?: "manual" | "debug"; stopAt?: string; sourceRunId?: string; items: ReadonlyArray<Readonly<{ json: unknown }>> }>
      >("POST /api/run"),
    ).toEqual({
      workflowId: WorkflowDetailFixtureFactory.workflowId,
      items: [{ json: {} }],
      stopAt: WorkflowDetailFixtureFactory.triggerNodeId,
      mode: "debug",
    });
  });

  it("keeps agent attachment nodes visible when rendering from a persisted workflow snapshot", async () => {
    const renderResult = WorkflowDetailTestRenderer.render();

    await waitFor(() => {
      expect(WorkflowRealtimeSocketMock.instances).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));

    await waitFor(() => {
      expect(screen.getByTestId(`run-summary-${WorkflowDetailFixtureFactory.runId}`)).toBeInTheDocument();
      WorkflowStatusAssertions.expectNodePresence(renderResult.container, [
        WorkflowDetailFixtureFactory.agentNodeId,
        WorkflowDetailFixtureFactory.llmNodeId,
        WorkflowDetailFixtureFactory.toolNodeId,
      ]);
    });
  });

  it("creates a manual execution for run to here", async () => {
    WorkflowDetailTestRenderer.render();

    await waitFor(() => {
      expect(WorkflowRealtimeSocketMock.instances).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Run to here" }));

    await waitFor(() => {
      expect(screen.getByTestId(`run-mode-${WorkflowDetailFixtureFactory.runId}`)).toHaveTextContent("Manual");
      expect(screen.getByTestId(`run-summary-${WorkflowDetailFixtureFactory.runId}`)).toBeInTheDocument();
    });

    expect(
      WorkflowFetchMock.latestRequestBody<
        Readonly<{ workflowId: string; mode?: "manual" | "debug"; stopAt?: string; sourceRunId?: string; items: ReadonlyArray<Readonly<{ json: unknown }>> }>
      >("POST /api/run"),
    ).toEqual({
      workflowId: WorkflowDetailFixtureFactory.workflowId,
      items: [{ json: {} }],
      stopAt: WorkflowDetailFixtureFactory.triggerNodeId,
      mode: "manual",
    });
  });

  it("pins input and reruns from a mutable execution", async () => {
    WorkflowDetailTestRenderer.render();

    await waitFor(() => {
      expect(WorkflowRealtimeSocketMock.instances).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Run to here" }));

    await waitFor(() => {
      expect(screen.getByTestId("execution-mode-label")).toHaveTextContent("Manual execution");
    });

    fireEvent.click(screen.getByRole("button", { name: "Pin selected node input" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: JSON.stringify({ pinned: true }, null, 2) } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("selected-node-pinned-badge")).toHaveTextContent("Pinned");
    });

    expect(
      WorkflowFetchMock.latestRequestBodyMatching<Readonly<{ items?: ReadonlyArray<Readonly<{ json: unknown }>> }>>(
        new RegExp(`^PATCH /api/runs/${WorkflowDetailFixtureFactory.runId}/nodes/.+/pin$`),
      ),
    ).toEqual({
      items: [{ json: { pinned: true } }],
    });

    fireEvent.click(screen.getByRole("button", { name: "Run from selected node" }));

    await waitFor(() => {
      expect(screen.getByTestId(`run-summary-${WorkflowDetailFixtureFactory.runId}_derived`)).toBeInTheDocument();
    });

    expect(
      WorkflowFetchMock.latestRequestBodyMatching<Readonly<{ mode?: "manual" | "debug" }>>(
        new RegExp(`^POST /api/runs/${WorkflowDetailFixtureFactory.runId}/nodes/.+/run$`),
      ),
    ).toEqual({
      mode: "manual",
    });
  });

  it("edits workflow snapshot json for a mutable execution", async () => {
    WorkflowDetailTestRenderer.render();

    await waitFor(() => {
      expect(WorkflowRealtimeSocketMock.instances).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Run to here" }));

    await waitFor(() => {
      expect(screen.getByTestId("edit-workflow-json-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("edit-workflow-json-button"));
    const snapshot = WorkflowDetailFixtureFactory.createWorkflowSnapshot();
    fireEvent.change(screen.getByRole("textbox"), {
      target: {
        value: JSON.stringify({ ...snapshot, name: "Edited snapshot" }, null, 2),
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId("workflow-title")).toHaveTextContent("Edited snapshot");
    });
  });

  it("debugs from a mutable execution with edited input", async () => {
    WorkflowDetailTestRenderer.render();

    await waitFor(() => {
      expect(WorkflowRealtimeSocketMock.instances).toHaveLength(1);
    });

    fireEvent.click(screen.getByRole("button", { name: "Run to here" }));

    await waitFor(() => {
      expect(screen.getByTestId("debug-selected-node-button")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("debug-selected-node-button"));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: JSON.stringify({ changed: true }, null, 2) } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.getByTestId(`run-summary-${WorkflowDetailFixtureFactory.runId}_derived`)).toBeInTheDocument();
    });

    expect(
      WorkflowFetchMock.latestRequestBodyMatching<Readonly<{ mode?: "manual" | "debug"; items?: ReadonlyArray<Readonly<{ json: unknown }>> }>>(
        new RegExp(`^POST /api/runs/${WorkflowDetailFixtureFactory.runId}/nodes/.+/run$`),
      ),
    ).toEqual({
      mode: "debug",
      items: [{ json: { changed: true } }],
    });
  });

  it("processes burst websocket messages without dropping intermediate node snapshots", async () => {
    const renderResult = WorkflowDetailTestRenderer.render();

    await waitFor(() => {
      expect(WorkflowRealtimeSocketMock.instances).toHaveLength(1);
    });

    const socket = WorkflowRealtimeSocketMock.latest();

    await waitFor(() => {
      expect(socket.sentMessages).toContain(JSON.stringify({ kind: "subscribeWorkflow", workflowId: WorkflowDetailFixtureFactory.workflowId }));
    });

    socket.emitJson({ kind: "subscribed", workflowId: WorkflowDetailFixtureFactory.workflowId });

    fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));

    await waitFor(() => {
      expect(screen.getByTestId(`run-summary-${WorkflowDetailFixtureFactory.runId}`)).toBeInTheDocument();
    });

    socket.emitJsonMessages([
      WorkflowRealtimeEventFactory.runCreated(),
      WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.triggerNodeId, 0),
      WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.nodeOneId, 1),
      WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.nodeOneId, 1),
      WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.agentNodeId, 2),
      WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.llmFirstInvocationNodeId, 3),
      WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.llmFirstInvocationNodeId, 3),
      WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.toolFirstInvocationNodeId, 4),
      WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.toolFirstInvocationNodeId, 4),
      WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.llmSecondInvocationNodeId, 5),
      WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.llmSecondInvocationNodeId, 5),
      WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.agentNodeId, 6),
      WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.nodeTwoId, 7),
      WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.nodeTwoId, 7),
    ]);

    await WorkflowStatusClock.waitForStatusVisibilityWindow();

    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(renderResult.container, {
        [WorkflowDetailFixtureFactory.triggerNodeId]: "completed",
        [WorkflowDetailFixtureFactory.nodeOneId]: "completed",
        [WorkflowDetailFixtureFactory.agentNodeId]: "completed",
        [WorkflowDetailFixtureFactory.llmNodeId]: "completed",
        [WorkflowDetailFixtureFactory.toolNodeId]: "completed",
        [WorkflowDetailFixtureFactory.nodeTwoId]: "completed",
      });
      WorkflowExecutionTreeAssertions.expectNodePresence([
        WorkflowDetailFixtureFactory.llmFirstInvocationNodeId,
        WorkflowDetailFixtureFactory.toolFirstInvocationNodeId,
        WorkflowDetailFixtureFactory.llmSecondInvocationNodeId,
      ]);
    });
  });

  it("switches input and output between json and pretty views", async () => {
    WorkflowDetailTestRenderer.render();

    await waitFor(() => {
      expect(WorkflowRealtimeSocketMock.instances).toHaveLength(1);
    });

    const socket = WorkflowRealtimeSocketMock.latest();

    fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));

    await waitFor(() => {
      expect(screen.getByTestId(`run-summary-${WorkflowDetailFixtureFactory.runId}`)).toBeInTheDocument();
    });

    socket.emitJson(WorkflowRealtimeEventFactory.runSaved());

    await waitFor(() => {
      expect(screen.getByTestId("workflow-inspector-pane-output")).toBeInTheDocument();
    });

    const outputPane = screen.getByTestId("workflow-inspector-pane-output");
    fireEvent.click(within(outputPane).getByTestId("inspector-format-output-pretty"));

    const outputBody = await within(outputPane).findByTestId("pretty-json-multiline-pretty-root.body");
    expect(outputBody).toHaveStyle({ whiteSpace: "pre-wrap" });
    expect(screen.queryByTestId("workflow-inspector-json-copy-hint")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("inspector-tab-input"));
    const inputPane = screen.getByTestId("workflow-inspector-pane-input");
    fireEvent.click(within(inputPane).getByTestId("inspector-format-input-pretty"));

    const inputBody = await within(inputPane).findByTestId("pretty-json-multiline-pretty-root.body");
    expect(inputBody).toHaveStyle({ whiteSpace: "pre-wrap" });
  });

  it("shows input and output at the same time in split mode", async () => {
    WorkflowDetailTestRenderer.render();

    await waitFor(() => {
      expect(WorkflowRealtimeSocketMock.instances).toHaveLength(1);
    });

    const socket = WorkflowRealtimeSocketMock.latest();

    fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));

    await waitFor(() => {
      expect(screen.getByTestId(`run-summary-${WorkflowDetailFixtureFactory.runId}`)).toBeInTheDocument();
    });

    socket.emitJson(WorkflowRealtimeEventFactory.runSaved());

    await WorkflowStatusClock.waitForStatusVisibilityWindow();

    fireEvent.click(screen.getByTestId("inspector-tab-split"));

    await screen.findByTestId("workflow-inspector-pane-input");
    await screen.findByTestId("workflow-inspector-pane-output");

    fireEvent.click(within(screen.getByTestId("workflow-inspector-pane-input")).getByTestId("inspector-format-input-pretty"));
    fireEvent.click(within(screen.getByTestId("workflow-inspector-pane-output")).getByTestId("inspector-format-output-pretty"));

    expect(await within(screen.getByTestId("workflow-inspector-pane-input")).findByTestId("pretty-json-multiline-pretty-root.body")).toHaveTextContent("Body line 1 (input");
    expect(await within(screen.getByTestId("workflow-inspector-pane-output")).findByTestId("pretty-json-multiline-pretty-root.body")).toHaveTextContent("Body line 1 (output");
  });

  it("shows node errors inside the output inspector instead of a separate error tab", async () => {
    WorkflowDetailTestRenderer.render();

    await waitFor(() => {
      expect(WorkflowRealtimeSocketMock.instances).toHaveLength(1);
    });

    const socket = WorkflowRealtimeSocketMock.latest();

    fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));

    await waitFor(() => {
      expect(screen.getByTestId(`run-summary-${WorkflowDetailFixtureFactory.runId}`)).toBeInTheDocument();
    });

    socket.emitJson(WorkflowRealtimeEventFactory.runSavedFailed());

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Error" })).not.toBeInTheDocument();
      expect(screen.getByTestId("inspector-tab-output")).toBeInTheDocument();
    });

    const outputPane = screen.getByTestId("workflow-inspector-pane-output");
    fireEvent.click(within(outputPane).getByTestId("inspector-format-output-pretty"));

    await waitFor(() => {
      expect(within(outputPane).getByTestId("workflow-inspector-error-headline")).toHaveTextContent(
        "NodeExecutionError: Execution failed while rendering preview output.",
      );
    });

    fireEvent.click(within(outputPane).getByTestId("inspector-format-output-json"));

    await waitFor(() => {
      expect(within(outputPane).getByTestId("workflow-inspector-json-copy-hint")).toBeInTheDocument();
      expect(within(outputPane).getByTestId("workflow-inspector-json-panel")).toHaveTextContent("Execution failed while rendering preview output.");
    });
  });
});
