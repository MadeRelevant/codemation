import { act, cleanup, fireEvent, render, screen, waitFor, type RenderResult } from "@testing-library/react";
import { createRootRoute, createRoute, createRouter, Outlet, RouterProvider } from "@tanstack/react-router";
import { expect } from "vitest";
import { Providers } from "../../../src/ui/providers/Providers";
import { WorkflowDetailScreen } from "../../../src/ui/screens/WorkflowDetailScreen";
import type { WorkflowDto } from "../../../src/client";
import type { WorkflowDetailRealtimeServerMessage } from "./WorkflowDetailRealtimeFixtures";
import { WorkflowDetailFixtureFactory } from "./WorkflowDetailFixtures";
import { WorkflowDetailSocketConnection, WorkflowDetailTestEnvironment } from "./WorkflowDetailTestEnvironment";

export class WorkflowDetailScreenTestKit {
  private renderResult: RenderResult | null = null;

  constructor(
    public readonly workflow: WorkflowDto = WorkflowDetailFixtureFactory.createWorkflowDetail(),
    public readonly environment: WorkflowDetailTestEnvironment = new WorkflowDetailTestEnvironment(workflow),
  ) {}

  static create(workflow: WorkflowDto = WorkflowDetailFixtureFactory.createWorkflowDetail()): WorkflowDetailScreenTestKit {
    return new WorkflowDetailScreenTestKit(workflow);
  }

  install(): this {
    this.environment.install();
    return this;
  }

  dispose(): void {
    cleanup();
    this.environment.restore();
  }

  render(): RenderResult {
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

    this.renderResult = render(
      <Providers websocketPort={this.environment.websocketPort}>
        <RouterProvider router={router} />
      </Providers>,
    );
    return this.renderResult;
  }

  get container(): HTMLElement {
    if (!this.renderResult) {
      throw new Error("Expected the workflow detail screen to be rendered.");
    }
    return this.renderResult.container;
  }

  latestSocket(): WorkflowDetailSocketConnection {
    return this.environment.latestSocket();
  }

  emitJson(message: WorkflowDetailRealtimeServerMessage | Readonly<Record<string, unknown>>): void {
    this.latestSocket().emitJson(message);
  }

  emitJsonMessages(messages: ReadonlyArray<WorkflowDetailRealtimeServerMessage | Readonly<Record<string, unknown>>>): void {
    this.latestSocket().emitJsonMessages(messages);
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

  async waitForSocketConnection(expectedCount = 1): Promise<WorkflowDetailSocketConnection> {
    await waitFor(() => {
      expect(this.environment.socketConnections).toHaveLength(expectedCount);
    });
    return this.latestSocket();
  }

  async waitForWorkflowSubscription(workflowId = this.workflow.id): Promise<void> {
    const socket = this.latestSocket();
    await waitFor(() => {
      expect(socket.sentMessages).toContain(JSON.stringify({ kind: "subscribe", roomId: workflowId }));
    });
  }

  async waitForRunSummary(runId = WorkflowDetailFixtureFactory.runId): Promise<void> {
    await waitFor(() => {
      expect(screen.getByTestId(`run-summary-${runId}`)).toBeInTheDocument();
    });
  }

  async startRun(): Promise<void> {
    fireEvent.click(screen.getByRole("button", { name: "Run workflow" }));
    await this.waitForRunSummary();
  }

  async runToHere(): Promise<void> {
    fireEvent.click(screen.getByRole("button", { name: "Run to here" }));
    await this.waitForRunSummary();
  }

  async debugHere(): Promise<void> {
    fireEvent.click(screen.getByRole("button", { name: "Debug here" }));
    await this.waitForRunSummary();
  }

  async waitForStatusVisibilityWindow(): Promise<void> {
    await act(async () => {
      await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
    });
  }
}
