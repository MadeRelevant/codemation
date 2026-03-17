import { describe, expect, it } from "vitest";
import { WorkflowDebuggerOverlayStateFactory } from "../src/application/workflows/WorkflowDebuggerOverlayStateFactory";
import { WorkflowDetailFixtureFactory } from "./workflowDetail/testkit/WorkflowDetailFixtures";

describe("WorkflowDebuggerOverlayStateFactory", () => {
  it("copies run state into the live workflow without marking copied outputs as pinned", () => {
    const baseState =
      WorkflowDetailFixtureFactory.createCompletedRunState() as Parameters<
        typeof WorkflowDebuggerOverlayStateFactory.copyRunStateToOverlay
      >[0]["sourceState"];
    const sourceState = {
      ...baseState,
      outputsByNode: {
        [WorkflowDetailFixtureFactory.nodeOneId]: {
          main: [{ json: { copied: "node-one" } }],
        },
        [WorkflowDetailFixtureFactory.agentNodeId]: {
          main: [{ json: { copied: "agent" } }],
        },
      },
      mutableState: {
        nodesById: {
          [WorkflowDetailFixtureFactory.nodeOneId]: {
            pinnedOutputsByPort: {
              main: [{ json: { stale: true } }],
            },
          },
        },
      },
    } as Parameters<typeof WorkflowDebuggerOverlayStateFactory.copyRunStateToOverlay>[0]["sourceState"];

    const overlay = WorkflowDebuggerOverlayStateFactory.copyRunStateToOverlay({
      workflowId: WorkflowDetailFixtureFactory.workflowId,
      sourceState,
      liveWorkflowNodeIds: new Set([
        WorkflowDetailFixtureFactory.nodeOneId,
        WorkflowDetailFixtureFactory.agentNodeId,
      ]),
      existingOverlay: WorkflowDetailFixtureFactory.createDebuggerOverlayState(WorkflowDetailFixtureFactory.workflowId, {
        outputsByNode: {},
        nodeSnapshotsByNodeId: {},
        mutableState: {
          nodesById: {
            [WorkflowDetailFixtureFactory.nodeOneId]: {
              pinnedOutputsByPort: {
                main: [{ json: { existingPin: true } }],
              },
            },
          },
        },
      }),
    });

    expect(overlay.currentState.outputsByNode[WorkflowDetailFixtureFactory.nodeOneId]).toEqual({
      main: [{ json: { copied: "node-one" } }],
    });
    expect(overlay.currentState.outputsByNode[WorkflowDetailFixtureFactory.agentNodeId]).toEqual({
      main: [{ json: { copied: "agent" } }],
    });
    expect(overlay.currentState.mutableState?.nodesById?.[WorkflowDetailFixtureFactory.nodeOneId]?.pinnedOutputsByPort).toBeUndefined();
    expect(overlay.currentState.mutableState?.nodesById?.[WorkflowDetailFixtureFactory.agentNodeId]?.pinnedOutputsByPort).toBeUndefined();
  });
});
