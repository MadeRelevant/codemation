// @vitest-environment jsdom

import type { PersistedRunState } from "@codemation/next-host/src/features/workflows/hooks/realtime/realtime";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";
import {
  WorkflowDetailRuntimeFixtureFactory,
  WorkflowDetailScreenTestKit,
  type WorkflowDetailRuntimeFixture,
} from "./testkit";

type OverlayBody = Readonly<{
  currentState: Readonly<{
    mutableState?: Readonly<{
      nodesById: Readonly<
        Record<
          string,
          Readonly<{
            pinnedOutputsByPort?: Readonly<Record<string, ReadonlyArray<Readonly<{ json: unknown }>>>>;
          }>
        >
      >;
    }>;
  }>;
}>;

class WorkflowDetailRealIntegrationFixture {
  static createDefaultWorkflow(): WorkflowDetailRuntimeFixture {
    return WorkflowDetailRuntimeFixtureFactory.createLinearWorkflow({
      workflowId: "wf.frontend.real.default",
      workflowName: "Workflow detail real default",
      nodeIds: ["Trigger", "Agent", "Node1", "Node2"],
    });
  }

  static createPinnedChainWorkflow(): WorkflowDetailRuntimeFixture {
    return WorkflowDetailRuntimeFixtureFactory.createLinearWorkflow({
      workflowId: "wf.frontend.real.pinned-chain",
      workflowName: "Workflow detail real pinned chain",
      nodeIds: ["A", "B", "C", "Agent", "E"],
    });
  }

  static createPinnedTripletWorkflow(): WorkflowDetailRuntimeFixture {
    return WorkflowDetailRuntimeFixtureFactory.createLinearWorkflow({
      workflowId: "wf.frontend.real.triplet",
      workflowName: "Workflow detail real triplet",
      nodeIds: ["A", "B", "C"],
    });
  }

  static createDebugSequenceWorkflow(): WorkflowDetailRuntimeFixture {
    return WorkflowDetailRuntimeFixtureFactory.createLinearWorkflow({
      workflowId: "wf.frontend.real.debug-sequence",
      workflowName: "Workflow detail real debug sequence",
      nodeIds: ["node_1", "node_2", "node_3", "node_4", "node_5", "node_6"],
    });
  }

  static createStopAtBWorkflow(): WorkflowDetailRuntimeFixture {
    return WorkflowDetailRuntimeFixtureFactory.createLinearWorkflow({
      workflowId: "wf.frontend.real.stop-at-b",
      workflowName: "Workflow detail real stop at B",
      nodeIds: ["A", "B", "C", "D"],
    });
  }

  static async createRenderedKit(fixture: WorkflowDetailRuntimeFixture): Promise<WorkflowDetailScreenTestKit> {
    const kit = await WorkflowDetailScreenTestKit.createInMemory(fixture);
    kit.render({ strictMode: false });
    await waitFor(() => {
      expect(screen.getByTestId("workflow-canvas-tab-live")).toBeInTheDocument();
    });
    return kit;
  }

  static async startRunAndWaitForCompletion(kit: WorkflowDetailScreenTestKit, terminalNodeId: string): Promise<string> {
    await kit.startRun();
    const runId = kit.latestWorkflowRunId();
    await kit.waitForLatestRunToComplete();
    await waitFor(() => {
      expect(kit.currentNodeStatus(terminalNodeId)).toBe("completed");
    });
    return runId;
  }

  static async pinNodeOutput(
    kit: WorkflowDetailScreenTestKit,
    nodeId: string,
    value: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    kit.selectCanvasNode(nodeId);
    await waitFor(() => {
      expect(screen.getByTestId("selected-node-name")).toHaveTextContent(nodeId);
    });
    fireEvent.click(screen.getByTestId("edit-output-button"));
    fireEvent.change(screen.getByTestId("workflow-json-editor-input"), {
      target: { value: JSON.stringify(value, null, 2) },
    });
    fireEvent.click(screen.getByTestId("workflow-json-editor-save"));
    await waitFor(() => {
      expect(screen.getByTestId("selected-node-pinned-badge")).toHaveTextContent("Pinned");
    });
  }

  static async runHistoricalWorkflowIntoLiveDebugger(
    kit: WorkflowDetailScreenTestKit,
    terminalNodeId: string,
  ): Promise<string> {
    const runId = await this.startRunAndWaitForCompletion(kit, terminalNodeId);
    kit.openExecutionsPane();
    await kit.waitForRunSummary(runId);
    fireEvent.click(screen.getByTestId(`run-summary-${runId}`));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-copy-to-live-button")).toBeEnabled();
    });
    await kit.copyToDebugger();
    return runId;
  }

  static async runToNodeAndWaitForCompletion(kit: WorkflowDetailScreenTestKit, nodeId: string): Promise<string> {
    const priorRunId = kit.latestWorkflowRunId();
    fireEvent.click(screen.getByTestId(`canvas-node-run-button-${nodeId}`));
    await kit.waitForLatestRunToComplete({ newerThanRunId: priorRunId });
    const runId = kit.latestWorkflowRunId();
    await waitFor(() => {
      expect(kit.currentNodeStatus(nodeId)).toBe("completed");
    });
    return runId;
  }

  static assertInspectorNodes(nodeIds: ReadonlyArray<string>): void {
    for (const nodeId of nodeIds) {
      expect(screen.getByTestId(`execution-tree-node-${nodeId}`)).toBeInTheDocument();
    }
  }

  static assertInspectorNodesMissing(nodeIds: ReadonlyArray<string>): void {
    for (const nodeId of nodeIds) {
      expect(screen.queryByTestId(`execution-tree-node-${nodeId}`)).not.toBeInTheDocument();
    }
  }
}

describe("workflow detail real integration", () => {
  let kit: WorkflowDetailScreenTestKit | null = null;

  afterEach(async () => {
    if (kit) {
      await kit.disposeAsync();
      kit = null;
    }
  });

  it("pins output in the live workflow and launches a fresh immutable run", async () => {
    const fixture = WorkflowDetailRealIntegrationFixture.createDefaultWorkflow();
    kit = await WorkflowDetailRealIntegrationFixture.createRenderedKit(fixture);

    await WorkflowDetailRealIntegrationFixture.pinNodeOutput(kit, "Agent", { pinned: true });

    const overlayBody = kit.latestRequestBody<OverlayBody>(
      `PUT ${ApiPaths.workflowDebuggerOverlay(fixture.workflowId)}`,
    );
    expect(overlayBody).toEqual(
      expect.objectContaining({
        currentState: expect.objectContaining({
          mutableState: expect.objectContaining({
            nodesById: expect.objectContaining({
              Agent: expect.objectContaining({
                pinnedOutputsByPort: expect.objectContaining({
                  main: [
                    expect.objectContaining({
                      json: { pinned: true },
                    }),
                  ],
                }),
              }),
            }),
          }),
        }),
      }),
    );

    fireEvent.click(screen.getByTestId("canvas-node-run-button-Agent"));

    await waitFor(() => {
      kit!.expectCallCount("POST /api/runs", 1);
    });

    expect(
      kit.latestRequestBody<
        Readonly<{ mode?: "manual" | "debug"; stopAt?: string; clearFromNodeId?: string; currentState?: unknown }>
      >("POST /api/runs"),
    ).toEqual({
      mode: "manual",
      stopAt: "Agent",
      clearFromNodeId: "Agent",
      currentState: expect.any(Object),
      workflowId: fixture.workflowId,
      items: [],
      synthesizeTriggerItems: false,
    });
    expect(screen.getByTestId("workflow-canvas-tab-live")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("workflow-runs-sidebar")).not.toBeInTheDocument();
  });

  it("copies a historical run into the live workflow", async () => {
    const fixture = WorkflowDetailRealIntegrationFixture.createDefaultWorkflow();
    kit = await WorkflowDetailRealIntegrationFixture.createRenderedKit(fixture);

    const runId = await WorkflowDetailRealIntegrationFixture.startRunAndWaitForCompletion(kit, "Node2");
    kit.openExecutionsPane();
    await kit.waitForRunSummary(runId);
    fireEvent.click(screen.getByTestId(`run-summary-${runId}`));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-copy-to-live-button")).toBeEnabled();
    });

    await kit.copyToDebugger();

    expect(
      kit.latestRequestBody<Readonly<{ sourceRunId?: string }>>(
        `POST ${ApiPaths.workflowDebuggerOverlayCopyRun(fixture.workflowId)}`,
      ),
    ).toEqual({
      sourceRunId: runId,
    });
    expect(screen.getByTestId("workflow-canvas-tab-live")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("workflow-runs-sidebar")).not.toBeInTheDocument();
  });

  it("lets users run again from the live workflow after a run finishes", async () => {
    const fixture = WorkflowDetailRealIntegrationFixture.createDefaultWorkflow();
    kit = await WorkflowDetailRealIntegrationFixture.createRenderedKit(fixture);

    await WorkflowDetailRealIntegrationFixture.startRunAndWaitForCompletion(kit, "Node2");

    fireEvent.click(screen.getByTestId("canvas-run-workflow-button"));

    await waitFor(() => {
      kit!.expectCallCount("POST /api/runs", 2);
    });

    expect(
      kit.latestRequestBody<
        Readonly<{ workflowId: string; currentState?: unknown; synthesizeTriggerItems?: boolean; mode?: string }>
      >("POST /api/runs"),
    ).toEqual({
      workflowId: fixture.workflowId,
      synthesizeTriggerItems: true,
      mode: "manual",
      currentState: {
        connectionInvocations: [],
        outputsByNode: {},
        nodeSnapshotsByNodeId: {},
        mutableState: {
          nodesById: {},
        },
      },
    });
    expect(screen.getByTestId("workflow-canvas-tab-live")).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByTestId("workflow-runs-sidebar")).not.toBeInTheDocument();
  });

  it("uses the backend pending run state to clear stale downstream inspector nodes when rerunning from A", async () => {
    const fixture = WorkflowDetailRealIntegrationFixture.createPinnedTripletWorkflow();
    kit = await WorkflowDetailRealIntegrationFixture.createRenderedKit(fixture);

    await WorkflowDetailRealIntegrationFixture.startRunAndWaitForCompletion(kit, "C");
    await WorkflowDetailRealIntegrationFixture.pinNodeOutput(kit, "B", { pinned: true });

    await waitFor(() => {
      expect(screen.getByTestId("execution-tree-node-B")).toBeInTheDocument();
      expect(screen.getByTestId("execution-tree-node-C")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("canvas-node-run-button-A"));

    await waitFor(() => {
      expect(kit!.currentNodeStatus("A")).toBe("completed");
      expect(screen.queryByTestId("execution-tree-node-B")).not.toBeInTheDocument();
      expect(screen.queryByTestId("execution-tree-node-C")).not.toBeInTheDocument();
    });
  });

  it("keeps pinned-output completions visible across chained reruns to C and E", async () => {
    const fixture = WorkflowDetailRealIntegrationFixture.createPinnedChainWorkflow();
    kit = await WorkflowDetailRealIntegrationFixture.createRenderedKit(fixture);

    await WorkflowDetailRealIntegrationFixture.startRunAndWaitForCompletion(kit, "E");
    await WorkflowDetailRealIntegrationFixture.pinNodeOutput(kit, "B", { pinned: "B" });
    await WorkflowDetailRealIntegrationFixture.pinNodeOutput(kit, "Agent", { pinned: "Agent" });

    const runIdBeforeToC = kit.latestWorkflowRunId();
    fireEvent.click(screen.getByTestId("canvas-node-run-button-C"));
    await kit.waitForLatestRunToComplete({ newerThanRunId: runIdBeforeToC });

    await waitFor(() => {
      expect(kit!.currentNodeStatus("A")).toBe("completed");
      expect(kit!.currentNodeStatus("B")).toBe("completed");
      expect(kit!.currentNodeStatus("C")).toBe("completed");
      expect(screen.getByTestId("execution-tree-node-A")).toBeInTheDocument();
      expect(screen.getByTestId("execution-tree-node-B")).toBeInTheDocument();
      expect(screen.getByTestId("execution-tree-node-C")).toBeInTheDocument();
      expect(screen.queryByTestId("execution-tree-node-Agent")).not.toBeInTheDocument();
      expect(screen.queryByTestId("execution-tree-node-E")).not.toBeInTheDocument();
    });

    const runIdBeforeToE = kit.latestWorkflowRunId();
    fireEvent.click(screen.getByTestId("canvas-node-run-button-E"));
    await kit.waitForLatestRunToComplete({ newerThanRunId: runIdBeforeToE });

    await waitFor(() => {
      expect(kit!.currentNodeStatus("A")).toBe("completed");
      expect(kit!.currentNodeStatus("B")).toBe("completed");
      expect(kit!.currentNodeStatus("C")).toBe("completed");
      expect(kit!.currentNodeStatus("Agent")).toBe("completed");
      expect(kit!.currentNodeStatus("E")).toBe("completed");
      expect(screen.getByTestId("execution-tree-node-A")).toBeInTheDocument();
      expect(screen.getByTestId("execution-tree-node-B")).toBeInTheDocument();
      expect(screen.getByTestId("execution-tree-node-C")).toBeInTheDocument();
      expect(screen.getByTestId("execution-tree-node-Agent")).toBeInTheDocument();
      expect(screen.getByTestId("execution-tree-node-E")).toBeInTheDocument();
    });
  });

  it("keeps the inspector and canvas in sync across a copy-to-live debug session", async () => {
    const fixture = WorkflowDetailRealIntegrationFixture.createDebugSequenceWorkflow();
    kit = await WorkflowDetailRealIntegrationFixture.createRenderedKit(fixture);

    await WorkflowDetailRealIntegrationFixture.runHistoricalWorkflowIntoLiveDebugger(kit, "node_6");

    await WorkflowDetailRealIntegrationFixture.runToNodeAndWaitForCompletion(kit, "node_3");
    await waitFor(() => {
      expect(kit!.currentNodeStatus("node_3")).toBe("completed");
      expect(kit!.currentNodeStatus("node_4")).toBe("pending");
      expect(kit!.currentNodeStatus("node_5")).toBe("pending");
      expect(kit!.currentNodeStatus("node_6")).toBe("pending");
    });

    await WorkflowDetailRealIntegrationFixture.runToNodeAndWaitForCompletion(kit, "node_4");
    await waitFor(() => {
      expect(kit!.currentNodeStatus("node_4")).toBe("completed");
      expect(kit!.currentNodeStatus("node_5")).toBe("pending");
      expect(kit!.currentNodeStatus("node_6")).toBe("pending");
    });
    expect(
      kit.latestRequestBody<
        Readonly<{
          currentState?: PersistedRunState | PersistedRunState["mutableState"] | unknown;
          clearFromNodeId?: string;
          stopAt?: string;
        }>
      >("POST /api/runs"),
    ).toEqual({
      workflowId: fixture.workflowId,
      items: [],
      synthesizeTriggerItems: false,
      currentState: expect.objectContaining({
        nodeSnapshotsByNodeId: expect.objectContaining({
          node_3: expect.objectContaining({
            status: "completed",
          }),
        }),
      }),
      clearFromNodeId: "node_4",
      stopAt: "node_4",
      mode: "manual",
    });

    await WorkflowDetailRealIntegrationFixture.runToNodeAndWaitForCompletion(kit, "node_5");
    await waitFor(() => {
      expect(kit!.currentNodeStatus("node_5")).toBe("completed");
      expect(kit!.currentNodeStatus("node_6")).toBe("pending");
    });
    expect(
      kit.latestRequestBody<Readonly<{ currentState?: unknown; clearFromNodeId?: string; stopAt?: string }>>(
        "POST /api/runs",
      ),
    ).toEqual({
      workflowId: fixture.workflowId,
      items: [],
      synthesizeTriggerItems: false,
      currentState: expect.objectContaining({
        nodeSnapshotsByNodeId: expect.objectContaining({
          node_4: expect.objectContaining({
            status: "completed",
          }),
        }),
      }),
      clearFromNodeId: "node_5",
      stopAt: "node_5",
      mode: "manual",
    });
  });

  it("clears stale downstream state before the backend run settles when stopping at B in A -> B -> C -> D", async () => {
    const fixture = WorkflowDetailRealIntegrationFixture.createStopAtBWorkflow();
    kit = await WorkflowDetailRealIntegrationFixture.createRenderedKit(fixture);

    await WorkflowDetailRealIntegrationFixture.runHistoricalWorkflowIntoLiveDebugger(kit, "D");

    fireEvent.click(screen.getByTestId("canvas-node-run-button-B"));

    await waitFor(() => {
      expect(kit!.currentNodeStatus("C")).toBe("pending");
      expect(kit!.currentNodeStatus("D")).toBe("pending");
    });

    await kit.waitForLatestRunToComplete();

    await waitFor(() => {
      expect(kit!.currentNodeStatus("A")).toBe("completed");
      expect(kit!.currentNodeStatus("B")).toBe("completed");
      expect(kit!.currentNodeStatus("C")).toBe("pending");
      expect(kit!.currentNodeStatus("D")).toBe("pending");
      expect(screen.getByTestId("canvas-run-workflow-button")).toBeEnabled();
      expect(screen.getByTestId("canvas-node-run-button-B")).toBeEnabled();
    });

    expect(
      kit.latestRequestBody<
        Readonly<{ workflowId: string; currentState?: unknown; clearFromNodeId?: string; stopAt?: string }>
      >("POST /api/runs"),
    ).toEqual({
      workflowId: fixture.workflowId,
      items: [],
      synthesizeTriggerItems: false,
      currentState: expect.objectContaining({
        nodeSnapshotsByNodeId: expect.objectContaining({
          D: expect.objectContaining({
            status: "completed",
          }),
        }),
      }),
      clearFromNodeId: "B",
      stopAt: "B",
      mode: "manual",
    });
  });
});
