import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import { WorkflowDetailFixtureFactory, WorkflowDetailScreenTestKit } from "./testkit";

type OverlayBody = Readonly<{
  currentState: Readonly<{
    mutableState?: Readonly<{
      nodesById: Readonly<
        Record<
          string,
          Readonly<{
            pinnedOutputsByPort?: Readonly<Record<string, ReadonlyArray<Readonly<{ json: unknown }>>>>;
            lastDebugInput?: ReadonlyArray<Readonly<{ json: unknown }>>;
          }>
        >
      >;
    }>;
  }>;
}>;

describe("workflow detail mutable execution flows", () => {
  let kit: WorkflowDetailScreenTestKit | null = null;

  afterEach(() => {
    kit?.dispose();
    kit = null;
  });

  it("pins output in the live workflow and launches a fresh immutable run", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();

    fireEvent.click(screen.getByTestId("edit-output-button"));
    fireEvent.change(screen.getByTestId("workflow-json-editor-input"), { target: { value: JSON.stringify({ pinned: true }, null, 2) } });
    fireEvent.click(screen.getByTestId("workflow-json-editor-save"));

    await waitFor(() => {
      expect(screen.getByTestId("selected-node-pinned-badge")).toHaveTextContent("Pinned");
    });

    const overlayBody = kit.latestRequestBody<OverlayBody>(`PUT ${ApiPaths.workflowDebuggerOverlay(WorkflowDetailFixtureFactory.workflowId)}`);
    expect(overlayBody).toEqual({
      currentState: expect.objectContaining({
        mutableState: {
          nodesById: {
            [WorkflowDetailFixtureFactory.agentNodeId]: {
              pinnedOutputsByPort: {
                main: [{ json: { pinned: true } }],
              },
            },
          },
        },
      }),
    });

    fireEvent.click(screen.getByTestId(`canvas-node-run-button-${WorkflowDetailFixtureFactory.agentNodeId}`));

    await waitFor(() => {
      expect(kit?.environment.workflowRuns).toHaveLength(1);
    });

    expect(
      kit.latestRequestBody<
        Readonly<{ mode?: "manual" | "debug"; stopAt?: string; clearFromNodeId?: string; currentState?: unknown }>
      >("POST /api/runs"),
    ).toEqual({
      mode: "manual",
      stopAt: WorkflowDetailFixtureFactory.agentNodeId,
      clearFromNodeId: WorkflowDetailFixtureFactory.agentNodeId,
      currentState: expect.any(Object),
      workflowId: WorkflowDetailFixtureFactory.workflowId,
      items: [{ json: {} }],
    });
    expect(screen.getByTestId("workflow-canvas-tab-live")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("workflow-runs-sidebar")).not.toBeInTheDocument();
  });

  it("shows the pinned output in the live inspector instead of the original node output", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.seedRun(WorkflowDetailFixtureFactory.createCompletedRunState({ workflow: kit.workflow }));
    kit.render();

    await kit.waitForSocketConnection();
    kit.openExecutionsPane();
    await kit.waitForRunSummary();
    fireEvent.click(screen.getByTestId(`run-summary-${WorkflowDetailFixtureFactory.runId}`));

    await waitFor(() => {
      expect(screen.getByTestId("canvas-copy-to-live-button")).toBeEnabled();
    });
    await kit.copyToDebugger();

    kit.selectCanvasNode(WorkflowDetailFixtureFactory.agentNodeId);

    await waitFor(() => {
      expect(screen.getByTestId("selected-node-name")).toHaveTextContent("Agent");
    });

    const outputPanel = (() => {
      const pane = screen.getByTestId("workflow-inspector-pane-output");
      const panel = pane.querySelector<HTMLElement>('[data-testid="workflow-inspector-json-panel"]');
      if (!panel) {
        throw new Error("Expected the workflow inspector output JSON panel to exist.");
      }
      return panel;
    });

    expect(outputPanel()).toHaveTextContent("OUTPUT subject 2");

    fireEvent.click(screen.getByTestId("edit-output-button"));
    fireEvent.change(screen.getByTestId("workflow-json-editor-input"), {
      target: { value: JSON.stringify({ pinned: true, source: "debugger" }, null, 2) },
    });
    fireEvent.click(screen.getByTestId("workflow-json-editor-save"));

    await waitFor(() => {
      expect(screen.getByTestId("selected-node-pinned-badge")).toHaveTextContent("Pinned");
      expect(outputPanel()).toHaveTextContent("pinned");
      expect(outputPanel()).not.toHaveTextContent("OUTPUT subject 2");
    });
  });

  it("copies a historical run into the live workflow", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.startRun();
    kit.openExecutionsPane();
    await kit.waitForRunSummary();
    fireEvent.click(screen.getByTestId(`run-summary-${WorkflowDetailFixtureFactory.runId}`));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-copy-to-live-button")).toBeEnabled();
    });
    await kit.copyToDebugger();

    expect(
      kit.latestRequestBody<Readonly<{ sourceRunId?: string }>>(
        `POST ${ApiPaths.workflowDebuggerOverlayCopyRun(WorkflowDetailFixtureFactory.workflowId)}`,
      ),
    ).toEqual({
      sourceRunId: WorkflowDetailFixtureFactory.runId,
    });
    expect(screen.getByTestId("workflow-canvas-tab-live")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("workflow-runs-sidebar")).not.toBeInTheDocument();
  });

  it("ignores realtime updates from unrelated runs while the live workflow is open", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.startRun();

    kit.emitJson({
      kind: "event",
      event: {
        kind: "runSaved",
        runId: "external-run",
        workflowId: WorkflowDetailFixtureFactory.workflowId,
        at: "2026-03-11T12:10:00.000Z",
        state: WorkflowDetailFixtureFactory.createCompletedRunState({ runId: "external-run", workflow: kit.workflow }),
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("workflow-canvas-tab-live")).toHaveAttribute("aria-pressed", "true");
    });

    expect(kit.currentNodeStatus(WorkflowDetailFixtureFactory.agentNodeId)).not.toBe("completed");
  });

  it("lets users run again from the live workflow after a run finishes", async () => {
    kit = WorkflowDetailScreenTestKit.create().install();
    kit.render();

    await kit.waitForSocketConnection();
    await kit.startRun();

    const firstRunId = kit.latestWorkflowRunId();
    kit.emitJson({
      kind: "event",
      event: {
        kind: "runSaved",
        runId: firstRunId,
        workflowId: WorkflowDetailFixtureFactory.workflowId,
        at: "2026-03-11T12:10:59.000Z",
        state: WorkflowDetailFixtureFactory.createCompletedRunState({ runId: firstRunId, workflow: kit.workflow }),
      },
    });

    await waitFor(() => {
      expect(kit!.currentNodeStatus(WorkflowDetailFixtureFactory.agentNodeId)).toBe("completed");
    });

    fireEvent.click(screen.getByTestId("canvas-run-workflow-button"));

    await waitFor(() => {
      expect(kit?.environment.callsByRoute.get("POST /api/runs")).toBe(2);
    });

    expect(
      kit.latestRequestBody<Readonly<{ workflowId: string; currentState?: unknown }>>("POST /api/runs"),
    ).toEqual({
      workflowId: WorkflowDetailFixtureFactory.workflowId,
      items: [{ json: {} }],
      currentState: expect.objectContaining({
        nodeSnapshotsByNodeId: expect.objectContaining({
          [WorkflowDetailFixtureFactory.agentNodeId]: expect.objectContaining({
            status: "completed",
          }),
        }),
      }),
    });
    expect(screen.getByTestId("workflow-canvas-tab-live")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("workflow-runs-sidebar")).not.toBeInTheDocument();
  });

});
