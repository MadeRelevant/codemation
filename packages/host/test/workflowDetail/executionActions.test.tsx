import { fireEvent,screen,waitFor } from "@testing-library/react";
import { afterEach,describe,expect,it } from "vitest";
import { WorkflowDetailFixtureFactory,WorkflowDetailRealtimeFixtureFactory,WorkflowDetailScreenTestKit } from "./testkit";
import { WorkflowDetailTestEnvironment } from "./testkit/WorkflowDetailTestEnvironment";

describe("workflow detail execution actions", () => {
  let kit: WorkflowDetailScreenTestKit | null = null;

  afterEach(() => {
    kit?.dispose();
    kit = null;
  });

  it("posts an empty item batch when manually running a webhook-trigger workflow", async () => {
    kit = WorkflowDetailScreenTestKit.create(
      WorkflowDetailFixtureFactory.createWorkflowDetail({
        triggerKind: "webhook",
        workflowName: "Frontend webhook workflow",
      }),
    ).install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.startRun();

    expect(
      kit.latestRequestBody<
        Readonly<{
          workflowId: string;
          items?: ReadonlyArray<Readonly<{ json: unknown }>>;
          synthesizeTriggerItems?: boolean;
          currentState?: unknown;
        }>
      >("POST /api/runs"),
    ).toEqual({
      workflowId: WorkflowDetailFixtureFactory.workflowId,
      synthesizeTriggerItems: true,
      currentState: expect.any(Object),
    });
  });

  it("creates a manual execution for run to here", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.runToHere();

    expect(screen.getByTestId("workflow-canvas-tab-live")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("workflow-runs-sidebar")).not.toBeInTheDocument();

    expect(
      kit.latestRequestBody<
        Readonly<{
          workflowId: string;
          mode?: "manual" | "debug";
          stopAt?: string;
          clearFromNodeId?: string;
          currentState?: unknown;
          sourceRunId?: string;
          items: ReadonlyArray<Readonly<{ json: unknown }>>;
          synthesizeTriggerItems?: boolean;
        }>
      >("POST /api/runs"),
    ).toEqual({
      workflowId: WorkflowDetailFixtureFactory.workflowId,
      items: [],
      synthesizeTriggerItems: false,
      stopAt: WorkflowDetailFixtureFactory.agentNodeId,
      clearFromNodeId: WorkflowDetailFixtureFactory.agentNodeId,
      currentState: expect.any(Object),
      mode: "manual",
    });
  });

  it("ignores rapid duplicate run-to-here clicks while a request is already being created", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();

    const runButton = screen.getByTestId(`canvas-node-run-button-${WorkflowDetailFixtureFactory.agentNodeId}`);
    fireEvent.click(runButton);
    fireEvent.click(runButton);

    await waitFor(() => {
      expect(kit?.environment.workflowRuns).toHaveLength(1);
    });

    expect(kit?.environment.callsByRoute.get("POST /api/runs")).toBe(1);
  });

  it("marks the trigger as running while the live workflow is fetching test items", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    if (!(kit.environment instanceof WorkflowDetailTestEnvironment)) {
      throw new Error("Expected a synthetic workflow detail test environment.");
    }
    kit.environment.deferNextRunResponse();
    kit.render();

    await kit.waitForSocketConnection();

    fireEvent.click(screen.getByTestId("canvas-run-workflow-button"));

    await waitFor(() => {
      expect(kit!.currentNodeStatus(WorkflowDetailFixtureFactory.triggerNodeId)).toBe("running");
    });

    kit.environment.releaseDeferredRunResponse();

    await waitFor(() => {
      expect(kit!.environment.workflowRuns).toHaveLength(1);
    });
  });

  it("keeps the live workflow inspectable before any executions exist", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();

    expect(screen.getByTestId("workflow-canvas-tab-live")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("workflow-runs-sidebar")).not.toBeInTheDocument();
    expect(screen.getByTestId("selected-node-name")).toHaveTextContent("Agent");
    expect(screen.getByTestId("canvas-run-workflow-button")).toBeEnabled();
    expect(screen.getByTestId(`canvas-node-run-button-${WorkflowDetailFixtureFactory.agentNodeId}`)).toBeEnabled();
    expect(screen.queryByTestId(`canvas-node-debug-button-${WorkflowDetailFixtureFactory.agentNodeId}`)).not.toBeInTheDocument();
  });

  it("shows live run updates on the canvas without switching to executions", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.startRun();

    expect(kit.currentNodeStatus(WorkflowDetailFixtureFactory.agentNodeId)).not.toBe("completed");

    kit.emitJson(WorkflowDetailRealtimeFixtureFactory.runSaved());

    await waitFor(() => {
      expect(kit!.currentNodeStatus(WorkflowDetailFixtureFactory.agentNodeId)).toBe("completed");
    });

    expect(screen.getByTestId("workflow-canvas-tab-live")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("workflow-runs-sidebar")).not.toBeInTheDocument();
  });
});
