import type {
  NodeExecutionSnapshot,
  PersistedRunState,
  WorkflowDto,
} from "@codemation/next-host/src/features/workflows/hooks/realtime/realtime";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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

  static createCompletedRunState(args: Readonly<{ runId: string; completedCount: number }>): PersistedRunState {
    const completedNodeIds = this.nodeIds.slice(0, args.completedCount);
    return {
      runId: args.runId,
      workflowId: this.workflowId,
      startedAt: this.startedAt,
      status: "completed",
      queue: [],
      outputsByNode: Object.fromEntries(
        completedNodeIds.map((nodeId, index) => [nodeId, { main: [{ json: { nodeId, step: index + 1 } }] }]),
      ) as PersistedRunState["outputsByNode"],
      nodeSnapshotsByNodeId: Object.fromEntries(
        completedNodeIds.map((nodeId, index) => [
          nodeId,
          this.createSnapshot({ nodeId, step: index + 1, status: "completed", runId: args.runId }),
        ]),
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

  static createSnapshot(
    args: Readonly<{ nodeId: string; step: number; status: NodeExecutionSnapshot["status"]; runId: string }>,
  ): NodeExecutionSnapshot {
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
});
