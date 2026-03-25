import { Providers } from "@codemation/next-host/src/providers/Providers";
import { ApiPaths } from "../../../src/presentation/http/ApiPaths";
import type {
  PersistedRunState,
  WorkflowDto,
} from "@codemation/next-host/src/features/workflows/hooks/realtime/realtime";
import { WorkflowDetailScreen } from "@codemation/next-host/src/features/workflows/screens/WorkflowDetailScreen";
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { act, cleanup, fireEvent, render, screen, waitFor, type RenderResult } from "@testing-library/react";
import { StrictMode, type ReactElement } from "react";
import { expect } from "vitest";
import { InMemoryWorkflowDetailTestEnvironment } from "./InMemoryWorkflowDetailTestEnvironment";
import { WorkflowDetailFixtureFactory } from "./WorkflowDetailFixtures";
import type { WorkflowDetailRealtimeServerMessage } from "./WorkflowDetailRealtimeFixtures";
import type { WorkflowDetailRuntimeFixture } from "./WorkflowDetailRuntimeFixtures";
import { WorkflowDetailSocketConnection, WorkflowDetailTestEnvironment } from "./WorkflowDetailTestEnvironment";

type WorkflowDetailEnvironment = WorkflowDetailTestEnvironment | InMemoryWorkflowDetailTestEnvironment;

export class WorkflowDetailScreenTestKit {
  private renderResult: RenderResult | null = null;

  constructor(
    public readonly workflow: WorkflowDto = WorkflowDetailFixtureFactory.createWorkflowDetail(),
    public readonly environment: WorkflowDetailEnvironment = new WorkflowDetailTestEnvironment(workflow),
  ) {}

  static create(
    workflow: WorkflowDto = WorkflowDetailFixtureFactory.createWorkflowDetail(),
  ): WorkflowDetailScreenTestKit {
    return new WorkflowDetailScreenTestKit(workflow);
  }

  static async createInMemory(fixture: WorkflowDetailRuntimeFixture): Promise<WorkflowDetailScreenTestKit> {
    const environment = new InMemoryWorkflowDetailTestEnvironment(fixture);
    await environment.install();
    return new WorkflowDetailScreenTestKit(fixture.workflow, environment);
  }

  install(): this {
    const installResult = this.environment.install();
    if (installResult instanceof Promise) {
      throw new Error(
        "WorkflowDetailScreenTestKit.installAsync() must be used with async workflow detail environments.",
      );
    }
    return this;
  }

  async installAsync(): Promise<this> {
    await this.environment.install();
    return this;
  }

  dispose(): void {
    cleanup();
    const restoreResult = this.environment.restore();
    if (restoreResult instanceof Promise) {
      throw new Error(
        "WorkflowDetailScreenTestKit.disposeAsync() must be used with async workflow detail environments.",
      );
    }
  }

  async disposeAsync(): Promise<void> {
    cleanup();
    await this.environment.restore();
  }

  render(options: Readonly<{ strictMode?: boolean }> = {}): RenderResult {
    const workflow = this.workflow;
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
    const content = (
      <Providers websocketPort={this.environment.websocketPort}>
        <RouterProvider router={router} />
      </Providers>
    );

    this.renderResult = render(options.strictMode ? this.wrapInStrictMode(content) : content);
    return this.renderResult;
  }

  get container(): HTMLElement {
    if (!this.renderResult) {
      throw new Error("Expected the workflow detail screen to be rendered.");
    }
    return this.renderResult.container;
  }

  latestSocket(): WorkflowDetailSocketConnection {
    if (!(this.environment instanceof WorkflowDetailTestEnvironment)) {
      throw new Error("The current workflow detail environment does not expose synthetic websocket connections.");
    }
    return this.environment.latestSocket();
  }

  emitJson(message: WorkflowDetailRealtimeServerMessage | Readonly<Record<string, unknown>>): void {
    if (this.environment instanceof WorkflowDetailTestEnvironment) {
      this.environment.recordSimulatedRealtimeServerMessage(message);
    }
    act(() => {
      if (this.environment instanceof WorkflowDetailTestEnvironment) {
        const env = this.environment;
        const workflowWsPath = ApiPaths.workflowWebsocket();
        const workflowSockets = env.socketConnections.filter((c) => c.url.includes(workflowWsPath));
        const targets =
          workflowSockets.length > 0 ? workflowSockets : [env.resolveSocketThatSubscribedToWorkflow(this.workflow.id)];
        const seen = new Set<WorkflowDetailSocketConnection>();
        for (const connection of targets) {
          if (!seen.has(connection)) {
            seen.add(connection);
            connection.emitJson(message);
          }
        }
        return;
      }
      this.latestSocket().emitJson(message);
    });
  }

  emitJsonMessages(
    messages: ReadonlyArray<WorkflowDetailRealtimeServerMessage | Readonly<Record<string, unknown>>>,
  ): void {
    for (const message of messages) {
      this.emitJson(message);
    }
  }

  expectCallCount(route: string, expectedCount: number): void {
    this.environment.expectCallCount(route, expectedCount);
  }

  latestRequestBody<TBody>(route: string): TBody {
    return this.environment.latestRequestBody<TBody>(route);
  }

  latestRequestBodyMatching<TBody>(pattern: RegExp): TBody {
    return this.environment.latestRequestBodyMatching<TBody>(pattern);
  }

  setWorkflowResponse(workflow: WorkflowDto): void {
    if (!(this.environment instanceof WorkflowDetailTestEnvironment)) {
      throw new Error("The current workflow detail environment does not support swapping workflow responses.");
    }
    this.environment.setWorkflowResponse(workflow);
  }

  async waitForSocketConnection(expectedCount = 1): Promise<WorkflowDetailSocketConnection> {
    if (!(this.environment instanceof WorkflowDetailTestEnvironment)) {
      throw new Error("The current workflow detail environment does not expose synthetic websocket connections.");
    }
    const environment = this.environment as WorkflowDetailTestEnvironment;
    await waitFor(() => {
      expect(environment.socketConnections.length).toBeGreaterThanOrEqual(expectedCount);
    });
    return this.latestSocket();
  }

  async waitForWorkflowSubscription(workflowId = this.workflow.id): Promise<void> {
    const subscribeJson = JSON.stringify({ kind: "subscribe", roomId: workflowId });
    await waitFor(() => {
      if (!(this.environment instanceof WorkflowDetailTestEnvironment)) {
        expect(this.latestSocket().sentMessages).toContain(subscribeJson);
        return;
      }
      const sentOnAnyConnection = this.environment.socketConnections.some((c) =>
        c.sentMessages.includes(subscribeJson),
      );
      expect(sentOnAnyConnection).toBe(true);
    });
  }

  async waitForRunSummary(runId = WorkflowDetailFixtureFactory.runId): Promise<void> {
    await waitFor(() => {
      expect(screen.getByTestId(`run-summary-${runId}`)).toBeInTheDocument();
    });
  }

  async startRun(): Promise<void> {
    fireEvent.click(screen.getByTestId("canvas-run-workflow-button"));
    await waitFor(() => {
      expect(this.environment.workflowRuns).toHaveLength(1);
    });
  }

  async runToHere(): Promise<void> {
    fireEvent.click(screen.getByTestId(`canvas-node-run-button-${WorkflowDetailFixtureFactory.agentNodeId}`));
    await waitFor(() => {
      expect(this.environment.workflowRuns).toHaveLength(1);
    });
  }

  async copyToDebugger(): Promise<void> {
    fireEvent.click(screen.getByTestId("canvas-copy-to-live-button"));
    await waitFor(() => {
      expect(screen.getByTestId("workflow-canvas-tab-live")).toHaveAttribute("aria-pressed", "true");
    });
  }

  openExecutionsPane(): void {
    fireEvent.click(screen.getByTestId("workflow-canvas-tab-executions"));
  }

  openLiveWorkflow(): void {
    fireEvent.click(screen.getByTestId("workflow-canvas-tab-live"));
  }

  latestWorkflowRunId(): string {
    const latestRun = this.environment.workflowRuns[0];
    if (!latestRun) {
      throw new Error("Expected at least one workflow run.");
    }
    return latestRun.runId;
  }

  currentNodeStatus(nodeId: string): string | null {
    return (
      this.container
        .querySelector<HTMLElement>(`[data-codemation-node-id="${nodeId}"]`)
        ?.getAttribute("data-codemation-node-status") ?? null
    );
  }

  selectCanvasNode(nodeId: string): void {
    let clicked = false;
    const inspectorTreeNode = this.container.querySelector<HTMLElement>(
      `[data-testid="execution-tree-node-${nodeId}"]`,
    );
    if (inspectorTreeNode) {
      fireEvent.click(inspectorTreeNode);
      clicked = true;
    }
    const canvasCard = this.container.querySelector<HTMLElement>(`[data-testid="canvas-node-card-${nodeId}"]`);
    if (canvasCard) {
      fireEvent.click(canvasCard);
      clicked = true;
    }
    const wrapper =
      this.container.querySelector<HTMLElement>(`[data-testid="rf__node-${nodeId}"]`) ??
      this.container.querySelector<HTMLElement>(`[data-codemation-node-id="${nodeId}"]`);
    if (wrapper) {
      const clickableElement = wrapper.querySelector<HTMLElement>(`[data-codemation-node-id="${nodeId}"]`) ?? wrapper;
      fireEvent.click(clickableElement);
      clicked = true;
    }
    if (!clicked) {
      throw new Error(`Expected canvas node ${nodeId} to exist.`);
    }
  }

  queueRunResponse(state: PersistedRunState): void {
    if (!(this.environment instanceof WorkflowDetailTestEnvironment)) {
      throw new Error("The current workflow detail environment does not support queued synthetic run responses.");
    }
    this.environment.queueRunResponse(state);
  }

  seedRun(state: PersistedRunState): void {
    if (!(this.environment instanceof WorkflowDetailTestEnvironment)) {
      throw new Error("The current workflow detail environment does not support seeding synthetic runs.");
    }
    this.environment.seedRun(state);
  }

  async waitForLatestRunToComplete(options?: Readonly<{ newerThanRunId?: string }>): Promise<PersistedRunState> {
    if (this.environment instanceof InMemoryWorkflowDetailTestEnvironment && options?.newerThanRunId) {
      await waitFor(() => {
        const latest = this.environment.workflowRuns[0]?.runId;
        expect(latest).toBeDefined();
        expect(latest).not.toBe(options.newerThanRunId);
      });
    }
    const runId = this.latestWorkflowRunId();
    if (this.environment instanceof InMemoryWorkflowDetailTestEnvironment) {
      return await this.environment.waitForRunToComplete(runId);
    }
    await waitFor(() => {
      expect(this.environment.runsById.get(runId)?.status).toBe("completed");
    });
    return this.environment.runsById.get(runId) as PersistedRunState;
  }

  async waitForStatusVisibilityWindow(): Promise<void> {
    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
    });
  }

  private wrapInStrictMode(content: ReactElement): ReactElement {
    return <StrictMode>{content}</StrictMode>;
  }
}
