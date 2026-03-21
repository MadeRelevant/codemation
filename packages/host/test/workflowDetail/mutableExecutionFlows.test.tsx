import type { PersistedRunState,WorkflowDto } from "@codemation/next-host/src/ui/realtime/realtime";
import { fireEvent,screen,waitFor } from "@testing-library/react";
import { afterEach,describe,expect,it } from "vitest";
import { WorkflowDetailFixtureFactory,WorkflowDetailScreenTestKit } from "./testkit";

class PinnedSkippedExecutionFixture {
  static readonly workflowId = "wf.frontend.pinned-skipped";
  static readonly runId = "run_frontend_pinned_to_c";

  static createWorkflow(): WorkflowDto {
    return {
      id: this.workflowId,
      name: "Pinned skipped workflow",
      nodes: [
        { id: "A", kind: "trigger", type: "ManualTriggerNode", name: "A" },
        { id: "B", kind: "node", type: "CallbackNode", name: "B" },
        { id: "C", kind: "node", type: "CallbackNode", name: "C" },
      ],
      edges: [
        { from: { nodeId: "A", output: "main" }, to: { nodeId: "B", input: "in" } },
        { from: { nodeId: "B", output: "main" }, to: { nodeId: "C", input: "in" } },
      ],
    };
  }

  static createCompletedRunState(): PersistedRunState {
    return {
      runId: this.runId,
      workflowId: this.workflowId,
      startedAt: "2026-03-17T09:00:00.000Z",
      status: "completed",
      queue: [],
      outputsByNode: {
        A: { main: [{ json: { emittedBy: "A" } }] },
        B: { main: [{ json: { pinned: true } }] },
        C: { main: [{ json: { emittedBy: "C" } }] },
      },
      nodeSnapshotsByNodeId: {
        A: this.createSnapshot({ nodeId: "A", status: "completed", second: 1, outputs: [{ json: { emittedBy: "A" } }] }),
        B: this.createSnapshot({ nodeId: "B", status: "completed", second: 2, outputs: [{ json: { pinned: true } }], usedPinnedOutput: true }),
        C: this.createSnapshot({ nodeId: "C", status: "completed", second: 3, outputs: [{ json: { emittedBy: "C" } }] }),
      },
      workflowSnapshot: undefined,
      mutableState: {
        nodesById: {
          B: {
            pinnedOutputsByPort: {
              main: [{ json: { pinned: true } }],
            },
          },
        },
      },
      pending: undefined,
      executionOptions: {
        mode: "manual",
        sourceWorkflowId: this.workflowId,
      },
    };
  }

  static createPendingRunState(workflow: WorkflowDto): PersistedRunState {
    return WorkflowDetailFixtureFactory.createInitialRunState({
      mode: "manual",
      runId: this.runId,
      workflow,
    });
  }

  private static createSnapshot(args: Readonly<{
    nodeId: string;
    status: "completed";
    second: number;
    outputs: ReadonlyArray<Readonly<{ json: unknown }>>;
    usedPinnedOutput?: boolean;
  }>): PersistedRunState["nodeSnapshotsByNodeId"][string] {
    const timestamp = `2026-03-17T09:00:${String(args.second).padStart(2, "0")}.000Z`;
    return {
      runId: this.runId,
      workflowId: this.workflowId,
      nodeId: args.nodeId,
      status: args.status,
      queuedAt: timestamp,
      startedAt: timestamp,
      finishedAt: timestamp,
      updatedAt: timestamp,
      usedPinnedOutput: args.usedPinnedOutput,
      inputsByPort: {
        in: [{ json: { receivedBy: args.nodeId } }],
      },
      outputs: {
        main: [...args.outputs],
      },
    };
  }
}

class PinnedChainExecutionFixture {
  static readonly workflowId = "wf.frontend.pinned-chain";
  static readonly historicalRunId = "run_frontend_pinned_chain_full";

  static createWorkflow(): WorkflowDto {
    return {
      id: this.workflowId,
      name: "Pinned chain workflow",
      nodes: [
        { id: "A", kind: "trigger", type: "ManualTriggerNode", name: "A" },
        { id: "B", kind: "node", type: "CallbackNode", name: "B" },
        { id: "C", kind: "node", type: "CallbackNode", name: "C" },
        { id: "Agent", kind: "node", type: "CallbackNode", name: "Agent", role: "agent" },
        { id: "E", kind: "node", type: "CallbackNode", name: "E" },
      ],
      edges: [
        { from: { nodeId: "A", output: "main" }, to: { nodeId: "B", input: "in" } },
        { from: { nodeId: "B", output: "main" }, to: { nodeId: "C", input: "in" } },
        { from: { nodeId: "C", output: "main" }, to: { nodeId: "Agent", input: "in" } },
        { from: { nodeId: "Agent", output: "main" }, to: { nodeId: "E", input: "in" } },
      ],
    };
  }

  static createHistoricalRunState(): PersistedRunState {
    return {
      runId: this.historicalRunId,
      workflowId: this.workflowId,
      startedAt: "2026-03-17T10:00:00.000Z",
      status: "completed",
      queue: [],
      outputsByNode: {
        A: { main: [{ json: { emittedBy: "A" } }] },
        B: { main: [{ json: { emittedBy: "B" } }] },
        C: { main: [{ json: { emittedBy: "C" } }] },
        Agent: { main: [{ json: { emittedBy: "Agent" } }] },
        E: { main: [{ json: { emittedBy: "E" } }] },
      },
      nodeSnapshotsByNodeId: {
        A: this.createSnapshot({ nodeId: "A", status: "completed", second: 1, runId: this.historicalRunId, outputs: [{ json: { emittedBy: "A" } }] }),
        B: this.createSnapshot({ nodeId: "B", status: "completed", second: 2, runId: this.historicalRunId, outputs: [{ json: { emittedBy: "B" } }] }),
        C: this.createSnapshot({ nodeId: "C", status: "completed", second: 3, runId: this.historicalRunId, outputs: [{ json: { emittedBy: "C" } }] }),
        Agent: this.createSnapshot({ nodeId: "Agent", status: "completed", second: 4, runId: this.historicalRunId, outputs: [{ json: { emittedBy: "Agent" } }] }),
        E: this.createSnapshot({ nodeId: "E", status: "completed", second: 5, runId: this.historicalRunId, outputs: [{ json: { emittedBy: "E" } }] }),
      },
      workflowSnapshot: undefined,
      mutableState: { nodesById: {} },
      pending: undefined,
      executionOptions: {
        mode: "manual",
        sourceWorkflowId: this.workflowId,
      },
    };
  }

  static createRunToAState(): PersistedRunState {
    return {
      runId: "run_frontend_pinned_chain_to_a",
      workflowId: this.workflowId,
      startedAt: "2026-03-17T10:04:00.000Z",
      status: "completed",
      queue: [],
      outputsByNode: {
        A: { main: [{ json: { emittedBy: "A" } }] },
        B: { main: [{ json: { pinned: "B" } }] },
        Agent: { main: [{ json: { pinned: "Agent" } }] },
      },
      nodeSnapshotsByNodeId: {
        A: this.createSnapshot({ nodeId: "A", status: "completed", second: 1, runId: "run_frontend_pinned_chain_to_a", outputs: [{ json: { emittedBy: "A" } }] }),
      },
      workflowSnapshot: undefined,
      mutableState: {
        nodesById: {
          B: {
            pinnedOutputsByPort: {
              main: [{ json: { pinned: "B" } }],
            },
          },
          Agent: {
            pinnedOutputsByPort: {
              main: [{ json: { pinned: "Agent" } }],
            },
          },
        },
      },
      pending: undefined,
      executionOptions: {
        mode: "manual",
        sourceWorkflowId: this.workflowId,
      },
    };
  }

  private static createSnapshot(args: Readonly<{
    nodeId: string;
    status: "completed";
    second: number;
    runId: string;
    outputs: ReadonlyArray<Readonly<{ json: unknown }>>;
    usedPinnedOutput?: boolean;
  }>): PersistedRunState["nodeSnapshotsByNodeId"][string] {
    const timestamp = `2026-03-17T10:00:${String(args.second).padStart(2, "0")}.000Z`;
    return {
      runId: args.runId,
      workflowId: this.workflowId,
      nodeId: args.nodeId,
      status: args.status,
      queuedAt: timestamp,
      startedAt: timestamp,
      finishedAt: timestamp,
      updatedAt: timestamp,
      usedPinnedOutput: args.usedPinnedOutput,
      inputsByPort: {
        in: [{ json: { receivedBy: args.nodeId } }],
      },
      outputs: {
        main: [...args.outputs],
      },
    };
  }
}

describe("workflow detail mutable execution flows", () => {
  let kit: WorkflowDetailScreenTestKit | null = null;

  afterEach(() => {
    kit?.dispose();
    kit = null;
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

  it("shows pinned-output completions for B in the inspector when running to C", async () => {
    const workflow = PinnedSkippedExecutionFixture.createWorkflow();
    const completedRunState = PinnedSkippedExecutionFixture.createCompletedRunState();

    kit = WorkflowDetailScreenTestKit.create(workflow).install();
    kit.queueRunResponse(PinnedSkippedExecutionFixture.createPendingRunState(workflow));
    kit.render();

    await kit.waitForSocketConnection();
    kit.selectCanvasNode("B");

    fireEvent.click(screen.getByTestId("edit-output-button"));
    fireEvent.change(screen.getByTestId("workflow-json-editor-input"), {
      target: { value: JSON.stringify({ pinned: true }, null, 2) },
    });
    fireEvent.click(screen.getByTestId("workflow-json-editor-save"));

    await waitFor(() => {
      expect(screen.getByTestId("selected-node-pinned-badge")).toHaveTextContent("Pinned");
    });

    fireEvent.click(screen.getByTestId("canvas-node-run-button-C"));

    expect(
      kit.latestRequestBody<Readonly<{ currentState?: PersistedRunState["mutableState"] | PersistedRunState | unknown; stopAt?: string; clearFromNodeId?: string }>>(
        "POST /api/runs",
      ),
    ).toEqual(expect.objectContaining({
      workflowId: workflow.id,
      items: [],
      synthesizeTriggerItems: false,
      currentState: expect.objectContaining({
        mutableState: {
          nodesById: {
            B: {
              pinnedOutputsByPort: {
                main: [{ json: { pinned: true } }],
              },
            },
          },
        },
      }),
      stopAt: "C",
      clearFromNodeId: "C",
      mode: "manual",
    }));

    kit.emitJson({
      kind: "event",
      event: {
        kind: "runSaved",
        runId: completedRunState.runId,
        workflowId: workflow.id,
        at: "2026-03-17T09:00:03.000Z",
        state: completedRunState,
      },
    });

    await waitFor(() => {
      expect(kit!.currentNodeStatus("A")).toBe("completed");
      expect(kit!.currentNodeStatus("B")).toBe("completed");
      expect(kit!.currentNodeStatus("C")).toBe("completed");
    });

  });

  it("keeps downstream pinned nodes on the canvas but removes them from the inspector when rerunning from the trigger", async () => {
    const workflow = PinnedChainExecutionFixture.createWorkflow();
    const historicalRunState = PinnedChainExecutionFixture.createHistoricalRunState();
    const runToAState = PinnedChainExecutionFixture.createRunToAState();

    kit = WorkflowDetailScreenTestKit.create(workflow).install();
    kit.seedRun(historicalRunState);
    kit.queueRunResponse(runToAState);
    kit.render();

    await kit.waitForSocketConnection();
    kit.openExecutionsPane();
    await kit.waitForRunSummary(historicalRunState.runId);
    fireEvent.click(screen.getByTestId(`run-summary-${historicalRunState.runId}`));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-copy-to-live-button")).toBeEnabled();
    });
    await kit.copyToDebugger();

    kit.selectCanvasNode("B");
    fireEvent.click(screen.getByTestId("edit-output-button"));
    fireEvent.change(screen.getByTestId("workflow-json-editor-input"), {
      target: { value: JSON.stringify({ pinned: "B" }, null, 2) },
    });
    fireEvent.click(screen.getByTestId("workflow-json-editor-save"));

    kit.selectCanvasNode("Agent");
    fireEvent.click(screen.getByTestId("edit-output-button"));
    fireEvent.change(screen.getByTestId("workflow-json-editor-input"), {
      target: { value: JSON.stringify({ pinned: "Agent" }, null, 2) },
    });
    fireEvent.click(screen.getByTestId("workflow-json-editor-save"));

    await waitFor(() => {
      expect(screen.getByTestId("execution-tree-node-B")).toBeInTheDocument();
      expect(screen.getByTestId("execution-tree-node-Agent")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("canvas-node-run-button-A"));

    expect(
      kit.latestRequestBody<Readonly<{ workflowId: string; stopAt?: string; clearFromNodeId?: string; currentState?: unknown }>>("POST /api/runs"),
    ).toEqual(expect.objectContaining({
      workflowId: workflow.id,
      currentState: expect.any(Object),
      stopAt: "A",
      clearFromNodeId: "A",
      mode: "manual",
      synthesizeTriggerItems: true,
    }));

    await waitFor(() => {
      expect(kit!.currentNodeStatus("A")).toBe("completed");
      expect(kit!.currentNodeStatus("B")).toBe("pending");
      expect(kit!.currentNodeStatus("Agent")).toBe("pending");
      expect(screen.queryByTestId("execution-tree-node-B")).not.toBeInTheDocument();
      expect(screen.queryByTestId("execution-tree-node-C")).not.toBeInTheDocument();
      expect(screen.queryByTestId("execution-tree-node-Agent")).not.toBeInTheDocument();
      expect(screen.queryByTestId("execution-tree-node-E")).not.toBeInTheDocument();
    });
  });

  it("restores required pinned nodes to the inspector when rerunning from A and then to C", async () => {
    const workflow = PinnedSkippedExecutionFixture.createWorkflow();
    const historicalRunState = {
      ...PinnedSkippedExecutionFixture.createCompletedRunState(),
      runId: "run_frontend_restore_pinned_full",
      outputsByNode: {
        A: { main: [{ json: { emittedBy: "A" } }] },
        B: { main: [{ json: { emittedBy: "B" } }] },
        C: { main: [{ json: { emittedBy: "C" } }] },
      },
      nodeSnapshotsByNodeId: {
        A: {
          ...PinnedSkippedExecutionFixture.createCompletedRunState().nodeSnapshotsByNodeId.A!,
          runId: "run_frontend_restore_pinned_full",
          outputs: { main: [{ json: { emittedBy: "A" } }] },
        },
        B: {
          ...PinnedSkippedExecutionFixture.createCompletedRunState().nodeSnapshotsByNodeId.B!,
          runId: "run_frontend_restore_pinned_full",
          usedPinnedOutput: false,
          outputs: { main: [{ json: { emittedBy: "B" } }] },
        },
        C: {
          ...PinnedSkippedExecutionFixture.createCompletedRunState().nodeSnapshotsByNodeId.C!,
          runId: "run_frontend_restore_pinned_full",
          outputs: { main: [{ json: { emittedBy: "C" } }] },
        },
      },
      mutableState: { nodesById: {} },
    } satisfies PersistedRunState;
    const runToAState = {
      ...WorkflowDetailFixtureFactory.createInitialRunState({
        workflow,
        runId: "run_frontend_restore_pinned_to_a",
        mode: "manual",
      }),
      status: "completed" as const,
      outputsByNode: {
        A: { main: [{ json: { emittedBy: "A" } }] },
        B: { main: [{ json: { pinned: true } }] },
      },
      nodeSnapshotsByNodeId: {
        A: {
          ...PinnedSkippedExecutionFixture.createCompletedRunState().nodeSnapshotsByNodeId.A!,
          runId: "run_frontend_restore_pinned_to_a",
          outputs: { main: [{ json: { emittedBy: "A" } }] },
        },
      },
      mutableState: {
        nodesById: {
          B: {
            pinnedOutputsByPort: {
              main: [{ json: { pinned: true } }],
            },
          },
        },
      },
    } satisfies PersistedRunState;
    const runToCState = {
      ...PinnedSkippedExecutionFixture.createCompletedRunState(),
      runId: "run_frontend_restore_pinned_to_c",
      outputsByNode: {
        A: { main: [{ json: { emittedBy: "A" } }] },
        B: { main: [{ json: { pinned: true } }] },
        C: { main: [{ json: { emittedBy: "C" } }] },
      },
      nodeSnapshotsByNodeId: {
        A: {
          ...PinnedSkippedExecutionFixture.createCompletedRunState().nodeSnapshotsByNodeId.A!,
          runId: "run_frontend_restore_pinned_to_c",
          outputs: { main: [{ json: { emittedBy: "A" } }] },
        },
        B: {
          ...PinnedSkippedExecutionFixture.createCompletedRunState().nodeSnapshotsByNodeId.B!,
          runId: "run_frontend_restore_pinned_to_c",
          usedPinnedOutput: true,
          outputs: { main: [{ json: { pinned: true } }] },
        },
        C: {
          ...PinnedSkippedExecutionFixture.createCompletedRunState().nodeSnapshotsByNodeId.C!,
          runId: "run_frontend_restore_pinned_to_c",
          outputs: { main: [{ json: { emittedBy: "C" } }] },
        },
      },
      mutableState: {
        nodesById: {
          B: {
            pinnedOutputsByPort: {
              main: [{ json: { pinned: true } }],
            },
          },
        },
      },
    } satisfies PersistedRunState;

    kit = WorkflowDetailScreenTestKit.create(workflow).install();
    kit.seedRun(historicalRunState);
    kit.queueRunResponse(runToAState);
    kit.queueRunResponse(runToCState);
    kit.render();

    await kit.waitForSocketConnection();
    kit.openExecutionsPane();
    await kit.waitForRunSummary(historicalRunState.runId);
    fireEvent.click(screen.getByTestId(`run-summary-${historicalRunState.runId}`));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-copy-to-live-button")).toBeEnabled();
    });
    await kit.copyToDebugger();

    kit.selectCanvasNode("B");
    fireEvent.click(screen.getByTestId("edit-output-button"));
    fireEvent.change(screen.getByTestId("workflow-json-editor-input"), {
      target: { value: JSON.stringify({ pinned: true }, null, 2) },
    });
    fireEvent.click(screen.getByTestId("workflow-json-editor-save"));

    fireEvent.click(screen.getByTestId("canvas-node-run-button-A"));
    await waitFor(() => {
      expect(screen.queryByTestId("execution-tree-node-B")).not.toBeInTheDocument();
      expect(screen.queryByTestId("execution-tree-node-C")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("canvas-node-run-button-C"));
    await waitFor(() => {
      expect(screen.getByTestId("execution-tree-node-A")).toBeInTheDocument();
      expect(screen.getByTestId("execution-tree-node-B")).toBeInTheDocument();
      expect(screen.getByTestId("execution-tree-node-C")).toBeInTheDocument();
    });
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

  it("keeps pinned state for surviving nodes and prunes removed nodes after workflowChanged", async () => {
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

    kit.selectCanvasNode(WorkflowDetailFixtureFactory.nodeOneId);
    fireEvent.click(screen.getByTestId("edit-output-button"));
    fireEvent.change(screen.getByTestId("workflow-json-editor-input"), {
      target: { value: JSON.stringify({ pinned: "node-one" }, null, 2) },
    });
    fireEvent.click(screen.getByTestId("workflow-json-editor-save"));

    await waitFor(() => {
      expect(screen.getByTestId("selected-node-pinned-badge")).toHaveTextContent("Pinned");
    });

    kit.selectCanvasNode(WorkflowDetailFixtureFactory.nodeTwoId);
    fireEvent.click(screen.getByTestId("edit-output-button"));
    fireEvent.change(screen.getByTestId("workflow-json-editor-input"), {
      target: { value: JSON.stringify({ pinned: "node-two" }, null, 2) },
    });
    fireEvent.click(screen.getByTestId("workflow-json-editor-save"));

    const updatedWorkflow = {
      ...kit.workflow,
      nodes: kit.workflow.nodes.filter((node) => node.id !== WorkflowDetailFixtureFactory.nodeTwoId),
      edges: kit.workflow.edges.filter(
        (edge) => edge.from.nodeId !== WorkflowDetailFixtureFactory.nodeTwoId && edge.to.nodeId !== WorkflowDetailFixtureFactory.nodeTwoId,
      ),
    };

    kit.setWorkflowResponse(updatedWorkflow);
    kit.emitJson({
      kind: "workflowChanged",
      workflowId: WorkflowDetailFixtureFactory.workflowId,
    });

    await waitFor(() => {
      expect(screen.queryByTestId(`canvas-node-card-${WorkflowDetailFixtureFactory.nodeTwoId}`)).not.toBeInTheDocument();
    });

    kit.selectCanvasNode(WorkflowDetailFixtureFactory.nodeOneId);
    await waitFor(() => {
      expect(screen.getByTestId("selected-node-name")).toHaveTextContent("Node 1");
      expect(screen.getByTestId("selected-node-pinned-badge")).toHaveTextContent("Pinned");
      expect(screen.queryByTestId(`canvas-node-card-${WorkflowDetailFixtureFactory.nodeTwoId}`)).not.toBeInTheDocument();
    });
  });


});
