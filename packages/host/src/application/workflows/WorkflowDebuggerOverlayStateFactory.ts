import type { PersistedRunState,RunCurrentState } from "@codemation/core";
import type { WorkflowDebuggerOverlayState } from "../../domain/workflows/WorkflowDebuggerOverlayState";

export class WorkflowDebuggerOverlayStateFactory {
  static createEmpty(workflowId: string): WorkflowDebuggerOverlayState {
    return {
      workflowId,
      updatedAt: new Date().toISOString(),
      currentState: {
        outputsByNode: {},
        nodeSnapshotsByNodeId: {},
        connectionInvocations: [],
        mutableState: {
          nodesById: {},
        },
      },
    };
  }

  static replaceCurrentState(args: Readonly<{
    workflowId: string;
    currentState?: RunCurrentState;
    copiedFromRunId?: string;
    updatedAt?: string;
  }>): WorkflowDebuggerOverlayState {
    return {
      workflowId: args.workflowId,
      updatedAt: args.updatedAt ?? new Date().toISOString(),
      copiedFromRunId: args.copiedFromRunId,
      currentState: this.cloneCurrentState(args.currentState),
    };
  }

  static copyRunStateToOverlay(args: Readonly<{
    workflowId: string;
    sourceState: PersistedRunState;
    liveWorkflowNodeIds: ReadonlySet<string>;
    existingOverlay?: WorkflowDebuggerOverlayState;
  }>): WorkflowDebuggerOverlayState {
    const existingState = this.cloneCurrentState(args.existingOverlay?.currentState);
    const filteredOutputsByNode: RunCurrentState["outputsByNode"] = { ...existingState.outputsByNode };
    const filteredSnapshotsByNodeId: RunCurrentState["nodeSnapshotsByNodeId"] = { ...existingState.nodeSnapshotsByNodeId };
    const filteredMutableNodesById = { ...(existingState.mutableState?.nodesById ?? {}) };
    const filteredConnectionInvocations = (args.sourceState.connectionInvocations ?? []).filter(
      (inv) => args.liveWorkflowNodeIds.has(inv.connectionNodeId) || args.liveWorkflowNodeIds.has(inv.parentAgentNodeId),
    );

    for (const nodeId of args.liveWorkflowNodeIds) {
      const nodeOutputs = args.sourceState.outputsByNode[nodeId];
      const nodeSnapshot = args.sourceState.nodeSnapshotsByNodeId[nodeId];
      if (nodeOutputs) {
        filteredOutputsByNode[nodeId] = JSON.parse(JSON.stringify(nodeOutputs)) as RunCurrentState["outputsByNode"][string];
      } else {
        delete filteredOutputsByNode[nodeId];
      }
      if (nodeSnapshot) {
        filteredSnapshotsByNodeId[nodeId] = JSON.parse(JSON.stringify(nodeSnapshot)) as RunCurrentState["nodeSnapshotsByNodeId"][string];
      } else {
        delete filteredSnapshotsByNodeId[nodeId];
      }
      filteredMutableNodesById[nodeId] = {
        ...(filteredMutableNodesById[nodeId] ?? {}),
        pinnedOutputsByPort: undefined,
      };
    }
    return {
      workflowId: args.workflowId,
      updatedAt: new Date().toISOString(),
      copiedFromRunId: args.sourceState.runId,
      currentState: {
        outputsByNode: filteredOutputsByNode,
        nodeSnapshotsByNodeId: filteredSnapshotsByNodeId,
        connectionInvocations: filteredConnectionInvocations.map((inv) => JSON.parse(JSON.stringify(inv))),
        mutableState: {
          nodesById: filteredMutableNodesById,
        },
      },
    };
  }

  static cloneCurrentState(currentState: RunCurrentState | undefined): RunCurrentState {
    if (!currentState) {
      return {
        outputsByNode: {},
        nodeSnapshotsByNodeId: {},
        connectionInvocations: [],
        mutableState: {
          nodesById: {},
        },
      };
    }
    return {
      outputsByNode: JSON.parse(JSON.stringify(currentState.outputsByNode ?? {})) as RunCurrentState["outputsByNode"],
      nodeSnapshotsByNodeId: JSON.parse(JSON.stringify(currentState.nodeSnapshotsByNodeId ?? {})) as RunCurrentState["nodeSnapshotsByNodeId"],
      connectionInvocations: currentState.connectionInvocations
        ? (JSON.parse(JSON.stringify(currentState.connectionInvocations)) as NonNullable<RunCurrentState["connectionInvocations"]>)
        : undefined,
      mutableState: JSON.parse(
        JSON.stringify(
          currentState.mutableState ?? {
            nodesById: {},
          },
        ),
      ) as NonNullable<RunCurrentState["mutableState"]>,
    };
  }
}
