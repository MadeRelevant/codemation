import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { NodeExecutionSnapshot, PersistedRunState, RunSummary, WorkflowDto } from "../../src/client";
import { WorkflowDetailScreenTestKit } from "./testkit";

class DebugSessionSequenceFixture {
  static readonly workflowId = "wf.frontend.debug-sequence";
  static readonly nodeIds = ["node_1", "node_2", "node_3", "node_4", "node_5", "node_6"] as const;
  static readonly startedAt = "2026-03-16T12:00:00.000Z";

  static createWorkflow(): WorkflowDto {
    return {
      id: this.workflowId,
      name: "Frontend debug sequence workflow",
      nodes: this.nodeIds.map((nodeId, index) => ({
        id: nodeId,
        kind: index === 0 ? "trigger" : "node",
        type: index === 0 ? "ManualTriggerNode" : "CallbackNode",
        name: `Node ${index + 1}`,
      })),
      edges: this.nodeIds.slice(0, -1).map((nodeId, index) => ({
        from: {
          nodeId,
          output: "main",
        },
        to: {
          nodeId: this.nodeIds[index + 1]!,
          input: "in",
        },
      })),
    };
  }

  static createRunSummary(state: PersistedRunState): RunSummary {
    return {
      runId: state.runId,
      workflowId: state.workflowId,
      startedAt: state.startedAt,
      status: state.status,
      executionOptions: state.executionOptions,
      parent: state.parent,
    };
  }

  static createCompletedRunState(args: Readonly<{ runId: string; completedCount: number }>): PersistedRunState {
    const completedNodeIds = this.nodeIds.slice(0, args.completedCount);
    return {
      runId: args.runId,
      workflowId: this.workflowId,
      startedAt: this.startedAt,
      status: "completed",
      queue: [],
      outputsByNode: Object.fromEntries(completedNodeIds.map((nodeId, index) => [nodeId, { main: [{ json: { nodeId, step: index + 1 } }] }])) as PersistedRunState["outputsByNode"],
      nodeSnapshotsByNodeId: Object.fromEntries(
        completedNodeIds.map((nodeId, index) => [nodeId, this.createSnapshot({ nodeId, step: index + 1, status: "completed", runId: args.runId })]),
      ) as PersistedRunState["nodeSnapshotsByNodeId"],
      workflowSnapshot: undefined,
      mutableState: {
        nodesById: {},
      },
      pending: undefined,
      executionOptions: {
        mode: "manual",
        sourceWorkflowId: this.workflowId,
      },
    };
  }

  static createPendingRunState(args: Readonly<{ runId: string }>): PersistedRunState {
    return {
      runId: args.runId,
      workflowId: this.workflowId,
      startedAt: this.startedAt,
      status: "pending",
      queue: [],
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
      workflowSnapshot: undefined,
      mutableState: {
        nodesById: {},
      },
      pending: undefined,
      executionOptions: {
        mode: "manual",
        sourceWorkflowId: this.workflowId,
      },
    };
  }

  static createSnapshot(args: Readonly<{ nodeId: string; step: number; status: NodeExecutionSnapshot["status"]; runId: string }>): NodeExecutionSnapshot {
    const timestamp = `2026-03-16T12:00:${String(args.step).padStart(2, "0")}.000Z`;
    return {
      runId: args.runId,
      workflowId: this.workflowId,
      nodeId: args.nodeId,
      status: args.status,
      queuedAt: timestamp,
      startedAt: timestamp,
      finishedAt: args.status === "completed" ? timestamp : undefined,
      updatedAt: timestamp,
      inputsByPort: {
        in: [{ json: { receivedBy: args.nodeId } }],
      },
      outputs: args.status === "completed" ? { main: [{ json: { emittedBy: args.nodeId } }] } : undefined,
    };
  }
}

describe("workflow detail debug session sequence", () => {
  let kit: WorkflowDetailScreenTestKit | null = null;

  afterEach(() => {
    kit?.dispose();
    kit = null;
  });

  it("disables run actions while the backend still has a live run pending", async () => {
    kit = WorkflowDetailScreenTestKit.create(DebugSessionSequenceFixture.createWorkflow()).install();
    kit.queueRunResponse(DebugSessionSequenceFixture.createPendingRunState({ runId: "run_pending" }));
    kit.render();

    await kit.waitForSocketConnection();

    fireEvent.click(screen.getByTestId("canvas-run-workflow-button"));

    await waitFor(() => {
      expect(screen.getByTestId("canvas-run-workflow-button")).toBeDisabled();
      expect(screen.getByTestId("canvas-node-run-button-node_4")).toBeDisabled();
    });

    fireEvent.click(screen.getByTestId("canvas-run-workflow-button"));
    expect(kit.environment.callsByRoute.get("POST /api/runs")).toBe(1);

    kit.emitJson({
      kind: "event",
      event: {
        kind: "runSaved",
        runId: "run_pending",
        workflowId: DebugSessionSequenceFixture.workflowId,
        at: "2026-03-16T12:00:59.000Z",
        state: DebugSessionSequenceFixture.createCompletedRunState({ runId: "run_pending", completedCount: 2 }),
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId("canvas-run-workflow-button")).toBeEnabled();
      expect(screen.getByTestId("canvas-node-run-button-node_4")).toBeEnabled();
    });
  });

  it("keeps the inspector and canvas in sync across a copy-to-live debug session", async () => {
    const workflow = DebugSessionSequenceFixture.createWorkflow();
    const historicalRun = DebugSessionSequenceFixture.createCompletedRunState({ runId: "run_full", completedCount: 6 });
    const runToNode3 = DebugSessionSequenceFixture.createCompletedRunState({ runId: "run_to_3", completedCount: 3 });
    const runToNode4 = DebugSessionSequenceFixture.createCompletedRunState({ runId: "run_to_4", completedCount: 4 });
    const runToNode5 = DebugSessionSequenceFixture.createCompletedRunState({ runId: "run_to_5", completedCount: 5 });

    kit = WorkflowDetailScreenTestKit.create(workflow).install();
    kit.seedRun(historicalRun);
    kit.queueRunResponse(runToNode3);
    kit.queueRunResponse(runToNode4);
    kit.queueRunResponse(runToNode5);
    kit.render();

    await kit.waitForSocketConnection();

    kit.openExecutionsPane();
    await kit.waitForRunSummary("run_full");
    fireEvent.click(screen.getByTestId("run-summary-run_full"));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-copy-to-live-button")).toBeEnabled();
    });
    await kit.copyToDebugger();

    fireEvent.click(screen.getByTestId("canvas-node-run-button-node_3"));
    kit.emitJson({
      kind: "event",
      event: {
        kind: "runSaved",
        runId: runToNode3.runId,
        workflowId: DebugSessionSequenceFixture.workflowId,
        at: "2026-03-16T12:00:30.000Z",
        state: runToNode3,
      },
    });

    await waitFor(() => {
      expect(kit!.currentNodeStatus("node_3")).toBe("completed");
      expect(kit!.currentNodeStatus("node_4")).toBe("pending");
      expect(kit!.currentNodeStatus("node_5")).toBe("pending");
      expect(kit!.currentNodeStatus("node_6")).toBe("pending");
    });

    fireEvent.click(screen.getByTestId("canvas-node-run-button-node_4"));
    kit.emitJson({
      kind: "event",
      event: {
        kind: "runSaved",
        runId: runToNode4.runId,
        workflowId: DebugSessionSequenceFixture.workflowId,
        at: "2026-03-16T12:00:40.000Z",
        state: runToNode4,
      },
    });

    await waitFor(() => {
      expect(kit!.currentNodeStatus("node_4")).toBe("completed");
      expect(kit!.currentNodeStatus("node_5")).toBe("pending");
      expect(kit!.currentNodeStatus("node_6")).toBe("pending");
    });
    expect(
      kit.latestRequestBody<Readonly<{ currentState?: PersistedRunState | PersistedRunState["mutableState"] | unknown; clearFromNodeId?: string; stopAt?: string }>>(
        "POST /api/runs",
      ),
    ).toEqual({
      workflowId: DebugSessionSequenceFixture.workflowId,
      items: [{ json: {} }],
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

    fireEvent.click(screen.getByTestId("canvas-node-run-button-node_5"));
    kit.emitJson({
      kind: "event",
      event: {
        kind: "runSaved",
        runId: runToNode5.runId,
        workflowId: DebugSessionSequenceFixture.workflowId,
        at: "2026-03-16T12:00:50.000Z",
        state: runToNode5,
      },
    });

    await waitFor(() => {
      expect(kit!.currentNodeStatus("node_5")).toBe("completed");
      expect(kit!.currentNodeStatus("node_6")).toBe("pending");
    });
    expect(
      kit.latestRequestBody<Readonly<{ currentState?: unknown; clearFromNodeId?: string; stopAt?: string }>>("POST /api/runs"),
    ).toEqual({
      workflowId: DebugSessionSequenceFixture.workflowId,
      items: [{ json: {} }],
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
    const workflow: WorkflowDto = {
      id: "wf.frontend.stop-at-b",
      name: "Stop at B workflow",
      nodes: [
        { id: "A", kind: "trigger", type: "ManualTriggerNode", name: "A" },
        { id: "B", kind: "node", type: "CallbackNode", name: "B" },
        { id: "C", kind: "node", type: "CallbackNode", name: "C" },
        { id: "D", kind: "node", type: "CallbackNode", name: "D" },
      ],
      edges: [
        { from: { nodeId: "A", output: "main" }, to: { nodeId: "B", input: "in" } },
        { from: { nodeId: "B", output: "main" }, to: { nodeId: "C", input: "in" } },
        { from: { nodeId: "C", output: "main" }, to: { nodeId: "D", input: "in" } },
      ],
    };
    const historicalRun: PersistedRunState = {
      runId: "run_abcd_full",
      workflowId: workflow.id,
      startedAt: "2026-03-16T13:10:00.000Z",
      status: "completed",
      queue: [],
      outputsByNode: {
        A: { main: [{ json: { nodeId: "A" } }] },
        B: { main: [{ json: { nodeId: "B" } }] },
        C: { main: [{ json: { nodeId: "C" } }] },
        D: { main: [{ json: { nodeId: "D" } }] },
      },
      nodeSnapshotsByNodeId: {
        A: DebugSessionSequenceFixture.createSnapshot({ nodeId: "A", step: 1, status: "completed", runId: "run_abcd_full" }),
        B: DebugSessionSequenceFixture.createSnapshot({ nodeId: "B", step: 2, status: "completed", runId: "run_abcd_full" }),
        C: DebugSessionSequenceFixture.createSnapshot({ nodeId: "C", step: 3, status: "completed", runId: "run_abcd_full" }),
        D: DebugSessionSequenceFixture.createSnapshot({ nodeId: "D", step: 4, status: "completed", runId: "run_abcd_full" }),
      },
      workflowSnapshot: undefined,
      mutableState: { nodesById: {} },
      pending: undefined,
      executionOptions: { mode: "manual", sourceWorkflowId: workflow.id },
    };
    const runToB: PersistedRunState = {
      ...historicalRun,
      runId: "run_abcd_to_b",
      outputsByNode: {
        A: { main: [{ json: { nodeId: "A" } }] },
        B: { main: [{ json: { nodeId: "B" } }] },
      },
      nodeSnapshotsByNodeId: {
        A: DebugSessionSequenceFixture.createSnapshot({ nodeId: "A", step: 1, status: "completed", runId: "run_abcd_to_b" }),
        B: DebugSessionSequenceFixture.createSnapshot({ nodeId: "B", step: 2, status: "completed", runId: "run_abcd_to_b" }),
      },
    };

    kit = WorkflowDetailScreenTestKit.create(workflow).install();
    kit.seedRun(historicalRun);
    kit.queueRunResponse(runToB);
    kit.render();

    await kit.waitForSocketConnection();
    kit.openExecutionsPane();
    await kit.waitForRunSummary("run_abcd_full");
    fireEvent.click(screen.getByTestId("run-summary-run_abcd_full"));
    await waitFor(() => {
      expect(screen.getByTestId("canvas-copy-to-live-button")).toBeEnabled();
    });
    await kit.copyToDebugger();

    fireEvent.click(screen.getByTestId("canvas-node-run-button-B"));

    await waitFor(() => {
      expect(kit!.currentNodeStatus("C")).toBe("pending");
      expect(kit!.currentNodeStatus("D")).toBe("pending");
    });

    kit.emitJson({
      kind: "event",
      event: {
        kind: "runSaved",
        runId: runToB.runId,
        workflowId: workflow.id,
        at: "2026-03-16T13:10:30.000Z",
        state: runToB,
      },
    });

    await waitFor(() => {
      expect(kit!.currentNodeStatus("A")).toBe("completed");
      expect(kit!.currentNodeStatus("B")).toBe("completed");
      expect(kit!.currentNodeStatus("C")).toBe("pending");
      expect(kit!.currentNodeStatus("D")).toBe("pending");
      expect(screen.getByTestId("canvas-run-workflow-button")).toBeEnabled();
      expect(screen.getByTestId("canvas-node-run-button-B")).toBeEnabled();
    });

    expect(
      kit.latestRequestBody<Readonly<{ workflowId: string; currentState?: unknown; clearFromNodeId?: string; stopAt?: string }>>("POST /api/runs"),
    ).toEqual({
      workflowId: workflow.id,
      items: [{ json: {} }],
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
