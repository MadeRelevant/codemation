import { describe, expect, it } from "vitest";
import { WorkflowDebuggerOverlayStateFactory } from "../src/application/workflows/WorkflowDebuggerOverlayStateFactory";
import { WorkflowDetailFixtureFactory } from "./workflowDetail/testkit/WorkflowDetailFixtures";

describe("WorkflowDebuggerOverlayStateFactory", () => {
  it("copies outputs and snapshots for every top-level workflow node in a linear chain", () => {
    const baseState = WorkflowDetailFixtureFactory.createCompletedRunState() as Parameters<
      typeof WorkflowDebuggerOverlayStateFactory.copyRunStateToOverlay
    >[0]["sourceState"];
    const sourceState = {
      ...baseState,
      outputsByNode: {
        [WorkflowDetailFixtureFactory.triggerNodeId]: { main: [{ json: { chain: "trigger" } }] },
        [WorkflowDetailFixtureFactory.nodeOneId]: { main: [{ json: { chain: "node_1" } }] },
        [WorkflowDetailFixtureFactory.agentNodeId]: { main: [{ json: { chain: "agent" } }] },
        [WorkflowDetailFixtureFactory.nodeTwoId]: { main: [{ json: { chain: "node_2" } }] },
      },
    } as Parameters<typeof WorkflowDebuggerOverlayStateFactory.copyRunStateToOverlay>[0]["sourceState"];

    const overlay = WorkflowDebuggerOverlayStateFactory.copyRunStateToOverlay({
      workflowId: WorkflowDetailFixtureFactory.workflowId,
      sourceState,
      liveWorkflowNodeIds: new Set([
        WorkflowDetailFixtureFactory.triggerNodeId,
        WorkflowDetailFixtureFactory.nodeOneId,
        WorkflowDetailFixtureFactory.agentNodeId,
        WorkflowDetailFixtureFactory.nodeTwoId,
      ]),
    });

    expect(overlay.currentState.outputsByNode[WorkflowDetailFixtureFactory.nodeOneId]?.main?.[0]?.json).toEqual({
      chain: "node_1",
    });
    expect(overlay.currentState.outputsByNode[WorkflowDetailFixtureFactory.nodeTwoId]?.main?.[0]?.json).toEqual({
      chain: "node_2",
    });
    expect(overlay.currentState.nodeSnapshotsByNodeId[WorkflowDetailFixtureFactory.nodeOneId]?.status).toBe(
      "completed",
    );
    expect(overlay.currentState.nodeSnapshotsByNodeId[WorkflowDetailFixtureFactory.nodeTwoId]?.status).toBe(
      "completed",
    );
  });

  it("copies run state into the live workflow without marking copied outputs as pinned", () => {
    const baseState = WorkflowDetailFixtureFactory.createCompletedRunState() as Parameters<
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
      liveWorkflowNodeIds: new Set([WorkflowDetailFixtureFactory.nodeOneId, WorkflowDetailFixtureFactory.agentNodeId]),
      existingOverlay: WorkflowDetailFixtureFactory.createDebuggerOverlayState(
        WorkflowDetailFixtureFactory.workflowId,
        {
          outputsByNode: {},
          nodeSnapshotsByNodeId: {},
          connectionInvocations: [],
          mutableState: {
            nodesById: {
              [WorkflowDetailFixtureFactory.nodeOneId]: {
                pinnedOutputsByPort: {
                  main: [{ json: { existingPin: true } }],
                },
              },
            },
          },
        },
      ),
    });

    expect(overlay.currentState.outputsByNode[WorkflowDetailFixtureFactory.nodeOneId]).toEqual({
      main: [{ json: { copied: "node-one" } }],
    });
    expect(overlay.currentState.outputsByNode[WorkflowDetailFixtureFactory.agentNodeId]).toEqual({
      main: [{ json: { copied: "agent" } }],
    });
    expect(
      overlay.currentState.mutableState?.nodesById?.[WorkflowDetailFixtureFactory.nodeOneId]?.pinnedOutputsByPort,
    ).toBeUndefined();
    expect(
      overlay.currentState.mutableState?.nodesById?.[WorkflowDetailFixtureFactory.agentNodeId]?.pinnedOutputsByPort,
    ).toBeUndefined();
  });

  /**
   * Regression: `copyRunStateToOverlay` merges only ids from `workflow.nodes` (see `CopyRunToWorkflowDebuggerCommandHandler`).
   * Connection-owned LLM/tool node ids (`agent__conn__llm`, …) must be listed in the live workflow for overlay copy.
   */
  it("omits agent attachment invocation outputs and snapshots from the debugger overlay (regression)", () => {
    const baseState = WorkflowDetailFixtureFactory.createCompletedRunState() as Parameters<
      typeof WorkflowDebuggerOverlayStateFactory.copyRunStateToOverlay
    >[0]["sourceState"];
    const binaryId = "bin_second_llm";
    const sourceState = {
      ...baseState,
      outputsByNode: {
        ...baseState.outputsByNode,
        [WorkflowDetailFixtureFactory.llmNodeId]: {
          main: [
            {
              json: { invocation: 2 },
              binary: {
                preview: {
                  id: binaryId,
                  storageKey: `runs/${baseState.runId}/nodes/${WorkflowDetailFixtureFactory.llmNodeId}/${binaryId}`,
                  mimeType: "application/octet-stream",
                  size: 4,
                  previewKind: "download" as const,
                  filename: "second.bin",
                },
              },
            },
          ],
        },
      },
    } as Parameters<typeof WorkflowDebuggerOverlayStateFactory.copyRunStateToOverlay>[0]["sourceState"];

    const overlay = WorkflowDebuggerOverlayStateFactory.copyRunStateToOverlay({
      workflowId: WorkflowDetailFixtureFactory.workflowId,
      sourceState,
      liveWorkflowNodeIds: new Set([
        WorkflowDetailFixtureFactory.triggerNodeId,
        WorkflowDetailFixtureFactory.nodeOneId,
        WorkflowDetailFixtureFactory.agentNodeId,
        WorkflowDetailFixtureFactory.nodeTwoId,
      ]),
    });

    expect(sourceState.outputsByNode[WorkflowDetailFixtureFactory.llmNodeId]).toBeDefined();
    expect(sourceState.nodeSnapshotsByNodeId[WorkflowDetailFixtureFactory.llmNodeId]?.status).toBe("completed");
    expect(overlay.currentState.outputsByNode[WorkflowDetailFixtureFactory.llmNodeId]).toBeUndefined();
    expect(overlay.currentState.nodeSnapshotsByNodeId[WorkflowDetailFixtureFactory.llmNodeId]).toBeUndefined();
  });

  /**
   * `WorkflowBuilder` only advances `seq` for auto-generated ids. A trigger with an explicit id does not
   * consume a sequence slot, so the first Callback becomes `Callback:1`. If an older run was created when
   * the trigger had no explicit id, that run stores outputs under `Callback:2` while the current definition
   * lists `Callback:1` — copy-to-live merges by current definition ids only, so the summarize step is lost.
   */
  it("omits runnable outputs when persisted outputs use a different auto-generated Callback id than the current definition", () => {
    const baseState = WorkflowDetailFixtureFactory.createCompletedRunState() as Parameters<
      typeof WorkflowDebuggerOverlayStateFactory.copyRunStateToOverlay
    >[0]["sourceState"];
    const triggerId = "gmail_trigger";
    const historicalCallbackId = "Callback:2";
    const currentCallbackId = "Callback:1";
    const sourceState = {
      ...baseState,
      workflowId: "wf.gmail.pull",
      outputsByNode: {
        [triggerId]: { main: [{ json: { trigger: true } }] },
        [historicalCallbackId]: { main: [{ json: { summarize: true } }] },
      },
      nodeSnapshotsByNodeId: {
        [triggerId]: WorkflowDetailFixtureFactory.createSnapshot(triggerId, "completed", 0, baseState.runId),
        [historicalCallbackId]: WorkflowDetailFixtureFactory.createSnapshot(
          historicalCallbackId,
          "completed",
          1,
          baseState.runId,
        ),
      },
    } as Parameters<typeof WorkflowDebuggerOverlayStateFactory.copyRunStateToOverlay>[0]["sourceState"];

    const overlay = WorkflowDebuggerOverlayStateFactory.copyRunStateToOverlay({
      workflowId: "wf.gmail.pull",
      sourceState,
      liveWorkflowNodeIds: new Set([triggerId, currentCallbackId]),
    });

    expect(overlay.currentState.outputsByNode[triggerId]?.main?.[0]?.json).toEqual({ trigger: true });
    expect(overlay.currentState.outputsByNode[historicalCallbackId]).toBeUndefined();
    expect(overlay.currentState.outputsByNode[currentCallbackId]).toBeUndefined();
    expect(overlay.currentState.nodeSnapshotsByNodeId[historicalCallbackId]).toBeUndefined();
  });
});
