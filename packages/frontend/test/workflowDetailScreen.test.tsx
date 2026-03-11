import { act, cleanup, fireEvent, render, screen, waitFor, type RenderResult } from "@testing-library/react";
import { AgentAttachmentNodeIdFactory, WorkflowBuilder, type ChatModelConfig, type ToolConfig } from "@codemation/core";
import { AIAgent, Callback, ManualTrigger } from "@codemation/core-nodes";
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
  readonly token = FrontendWorkflowDetailChatModelFactory as ChatModelConfig["token"];

  constructor(
    public readonly name: string,
    public readonly presentation?: ChatModelConfig["presentation"],
  ) {}
}

class FrontendWorkflowDetailToolConfig implements ToolConfig {
  readonly token = FrontendWorkflowDetailTool as ToolConfig["token"];

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

  static createWorkflowDetail(): WorkflowDto {
    const workflow = new WorkflowBuilder({ id: this.workflowId, name: "Frontend realtime workflow" })
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

    return new CodemationWorkflowDtoMapper().toDetail(workflow) as WorkflowDto;
  }

  static createInitialRunState(): PersistedRunState {
    return {
      runId: this.runId,
      workflowId: this.workflowId,
      startedAt: this.startedAt,
      status: "pending",
      pending: undefined,
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
    };
  }

  static createCompletedRunState(): PersistedRunState {
    return {
      ...this.createInitialRunState(),
      status: "completed",
      nodeSnapshotsByNodeId: {
        [this.triggerNodeId]: this.createSnapshot(this.triggerNodeId, "completed", 0),
        [this.nodeOneId]: this.createSnapshot(this.nodeOneId, "completed", 1),
        [this.agentNodeId]: this.createSnapshot(this.agentNodeId, "completed", 2),
        [this.llmNodeId]: this.createSnapshot(this.llmNodeId, "completed", 3),
        [this.toolNodeId]: this.createSnapshot(this.toolNodeId, "completed", 4),
        [this.nodeTwoId]: this.createSnapshot(this.nodeTwoId, "completed", 5),
      },
    };
  }

  static createSnapshot(nodeId: string, status: WorkflowSnapshot["status"], step: number): WorkflowSnapshot {
    const timestamp = this.timestamp(step);
    return {
      runId: this.runId,
      workflowId: this.workflowId,
      nodeId,
      status,
      queuedAt: status === "running" ? timestamp : undefined,
      startedAt: status === "running" || status === "completed" ? timestamp : undefined,
      finishedAt: status === "completed" ? timestamp : undefined,
      updatedAt: timestamp,
      inputsByPort: { in: [{ json: { step } }] },
      outputs: status === "completed" ? { main: [{ json: { step } }] } : undefined,
    };
  }

  private static timestamp(step: number): string {
    const second = String(step).padStart(2, "0");
    return `2026-03-11T12:00:${second}.000Z`;
  }
}

class WorkflowFetchMock {
  private static readonly callsByRoute = new Map<string, number>();

  static install(): void {
    const handler = this.handleRequest.bind(this) as typeof fetch;
    vi.stubGlobal("fetch", handler);
  }

  static restore(): void {
    vi.unstubAllGlobals();
    this.callsByRoute.clear();
  }

  static expectCallCount(route: string, expectedCount: number): void {
    expect(this.callsByRoute.get(route) ?? 0).toBe(expectedCount);
  }

  private static async handleRequest(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, window.location.origin);
    const method = (init?.method ?? "GET").toUpperCase();
    const routeKey = `${method} ${url.pathname}`;
    this.callsByRoute.set(routeKey, (this.callsByRoute.get(routeKey) ?? 0) + 1);

    if (method === "POST" && url.pathname === "/api/realtime/ready") {
      return Response.json({ ok: true, websocketPort: "31337" });
    }
    if (method === "GET" && url.pathname === `/api/workflows/${encodeURIComponent(WorkflowDetailFixtureFactory.workflowId)}/runs`) {
      return Response.json([]);
    }
    if (method === "POST" && url.pathname === "/api/run") {
      return Response.json({
        runId: WorkflowDetailFixtureFactory.runId,
        workflowId: WorkflowDetailFixtureFactory.workflowId,
        status: "pending",
        startedAt: WorkflowDetailFixtureFactory.startedAt,
        state: WorkflowDetailFixtureFactory.createInitialRunState(),
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

class WorkflowStatusAssertions {
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

class WorkflowDetailTestRenderer {
  static render(): RenderResult {
    const workflow = WorkflowDetailFixtureFactory.createWorkflowDetail();
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
      expect(screen.getByText(WorkflowDetailFixtureFactory.runId)).toBeInTheDocument();
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

    socket.emitJson(WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.llmNodeId, 3));
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(renderResult.container, {
        [WorkflowDetailFixtureFactory.agentNodeId]: "running",
        [WorkflowDetailFixtureFactory.llmNodeId]: "running",
        [WorkflowDetailFixtureFactory.toolNodeId]: "pending",
      });
    });

    socket.emitJson(WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.llmNodeId, 3));
    await WorkflowStatusClock.waitForStatusVisibilityWindow();
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(renderResult.container, {
        [WorkflowDetailFixtureFactory.agentNodeId]: "running",
        [WorkflowDetailFixtureFactory.llmNodeId]: "completed",
        [WorkflowDetailFixtureFactory.toolNodeId]: "pending",
      });
    });

    socket.emitJson(WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.toolNodeId, 4));
    await waitFor(() => {
      WorkflowStatusAssertions.expectStatuses(renderResult.container, {
        [WorkflowDetailFixtureFactory.agentNodeId]: "running",
        [WorkflowDetailFixtureFactory.llmNodeId]: "completed",
        [WorkflowDetailFixtureFactory.toolNodeId]: "running",
      });
    });

    socket.emitJson(WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.toolNodeId, 4));
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
      expect(screen.getByText("completed")).toBeInTheDocument();
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
      expect(screen.getByText(WorkflowDetailFixtureFactory.runId)).toBeInTheDocument();
    });

    socket.emitJsonMessages([
      WorkflowRealtimeEventFactory.runCreated(),
      WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.triggerNodeId, 0),
      WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.nodeOneId, 1),
      WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.nodeOneId, 1),
      WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.agentNodeId, 2),
      WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.llmNodeId, 3),
      WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.llmNodeId, 3),
      WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.toolNodeId, 4),
      WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.toolNodeId, 4),
      WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.agentNodeId, 5),
      WorkflowRealtimeEventFactory.nodeStarted(WorkflowDetailFixtureFactory.nodeTwoId, 6),
      WorkflowRealtimeEventFactory.nodeCompleted(WorkflowDetailFixtureFactory.nodeTwoId, 6),
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
    });
  });
});
