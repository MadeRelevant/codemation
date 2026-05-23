"use client";
import { useCallback } from "react";
import { WorkflowDetailPresenter } from "../../lib/workflowDetail/WorkflowDetailPresenter";
import type { Items, PersistedRunState, RunCurrentState, WorkflowDto } from "../realtime/realtime";
import type { JsonEditorState, ViewedWorkflowContext } from "../../lib/workflowDetail/workflowDetailTypes";
import type { WorkflowPinControllerReturn } from "../../types/workflowDetail/WorkflowPinControllerReturn.types";

export function useWorkflowPinController(
  args: Readonly<{
    workflowId: string;
    // Run state read via props (D5 compliant)
    viewContext: ViewedWorkflowContext;
    currentExecutionState: RunCurrentState | PersistedRunState | undefined;
    displayedWorkflow: WorkflowDto | undefined;
    replaceDebuggerOverlay: (nextCurrentState: RunCurrentState) => Promise<void>;
    /**
     * The currently selected output port, used when resolving the active port
     * for a node that matches the inspector's current selection.
     */
    selectedNodeId: string | null;
    selectedOutputPort: string | null;
  }>,
): WorkflowPinControllerReturn {
  const {
    workflowId,
    viewContext,
    currentExecutionState,
    displayedWorkflow,
    replaceDebuggerOverlay,
    selectedNodeId,
    selectedOutputPort,
  } = args;

  const createOverlayCurrentStateWithNodeState = useCallback(
    (
      nodeId: string,
      values: Readonly<{
        pinnedOutputsByPort?: NonNullable<
          NonNullable<PersistedRunState["mutableState"]>["nodesById"][string]["pinnedOutputsByPort"]
        >;
      }>,
    ) => {
      const baseCurrentState = JSON.parse(
        JSON.stringify(
          currentExecutionState ?? {
            outputsByNode: {},
            nodeSnapshotsByNodeId: {},
            mutableState: { nodesById: {} },
            connectionInvocations: [],
          },
        ),
      ) as RunCurrentState;
      return {
        ...baseCurrentState,
        mutableState: {
          nodesById: {
            ...(baseCurrentState.mutableState?.nodesById ?? {}),
            [nodeId]: {
              ...(baseCurrentState.mutableState?.nodesById?.[nodeId] ?? {}),
              ...values,
            },
          },
        },
      } satisfies RunCurrentState;
    },
    [currentExecutionState],
  );

  const createOverlayCurrentStateWithOutputPortPin = useCallback(
    (nodeId: string, outputPort: string, items: Items | undefined) => {
      const currentPinnedOutputs = {
        ...(WorkflowDetailPresenter.getPinnedOutputsByPort(currentExecutionState, nodeId) ?? {}),
      };
      if (items === undefined) {
        delete currentPinnedOutputs[outputPort];
      } else {
        currentPinnedOutputs[outputPort] = items;
      }
      return createOverlayCurrentStateWithNodeState(nodeId, {
        pinnedOutputsByPort: Object.keys(currentPinnedOutputs).length > 0 ? currentPinnedOutputs : undefined,
      });
    },
    [createOverlayCurrentStateWithNodeState, currentExecutionState],
  );

  const resolveOutputPortForNode = useCallback(
    (nodeId: string): string | null => {
      const snapshot = currentExecutionState?.nodeSnapshotsByNodeId?.[nodeId];
      const workflowNode = displayedWorkflow?.nodes.find((node) => node.id === nodeId);
      const pinnedOutputsByPort = WorkflowDetailPresenter.getPinnedOutputsByPort(currentExecutionState, nodeId);
      const visibleEntries = WorkflowDetailPresenter.applyPinnedOutputsToPortEntries(
        WorkflowDetailPresenter.sortPortEntries(snapshot?.outputs),
        pinnedOutputsByPort,
      );
      const preferredPort = nodeId === selectedNodeId ? selectedOutputPort : null;
      const resolved = WorkflowDetailPresenter.resolveSelectedPort(visibleEntries, preferredPort);
      if (resolved) return resolved;
      const edgePorts =
        displayedWorkflow?.edges.filter((edge) => edge.from.nodeId === nodeId).map((edge) => edge.from.output) ?? [];
      const declaredPorts = workflowNode?.declaredOutputPorts ?? [];
      const base = [...new Set([...declaredPorts, ...edgePorts])];
      const combined =
        base.length > 0
          ? [...new Set([...base, ...(workflowNode?.hasNodeErrorHandler ? ["error"] : [])])]
          : workflowNode?.hasNodeErrorHandler
            ? (["main", "error"] as const)
            : (["main"] as const);
      const ordered = [...combined].sort((left, right) => {
        if (left === right) return 0;
        if (left === "main") return -1;
        if (right === "main") return 1;
        return left.localeCompare(right);
      });
      if (preferredPort && ordered.includes(preferredPort)) return preferredPort;
      return ordered[0] ?? null;
    },
    [currentExecutionState, displayedWorkflow?.edges, displayedWorkflow?.nodes, selectedNodeId, selectedOutputPort],
  );

  const togglePinnedOutput = useCallback(
    (nodeId: string, outputPort: string) => {
      if (viewContext !== "live-workflow") return;
      const pinnedOutput = WorkflowDetailPresenter.getPinnedOutputForPort(currentExecutionState, nodeId, outputPort);
      if (pinnedOutput) {
        const nextCurrentState = createOverlayCurrentStateWithOutputPortPin(nodeId, outputPort, undefined);
        void replaceDebuggerOverlay(nextCurrentState);
        return;
      }
      const outputToPin = currentExecutionState?.nodeSnapshotsByNodeId?.[nodeId]?.outputs?.[outputPort];
      if (!outputToPin) return;
      const nextCurrentState = createOverlayCurrentStateWithOutputPortPin(
        nodeId,
        outputPort,
        JSON.parse(JSON.stringify(outputToPin)) as Items,
      );
      void replaceDebuggerOverlay(nextCurrentState);
    },
    [createOverlayCurrentStateWithOutputPortPin, currentExecutionState, replaceDebuggerOverlay, viewContext],
  );

  const buildPinEditorState = useCallback(
    (nodeId: string, outputPort: string): JsonEditorState | null => {
      if (viewContext !== "live-workflow") return null;
      const snapshot = currentExecutionState?.nodeSnapshotsByNodeId?.[nodeId];
      const workflowNode = displayedWorkflow?.nodes.find((node) => node.id === nodeId);
      const pinnedOutput = WorkflowDetailPresenter.getPinnedOutputForPort(currentExecutionState, nodeId, outputPort);
      const visibleEntries = WorkflowDetailPresenter.applyPinnedOutputsToPortEntries(
        WorkflowDetailPresenter.sortPortEntries(snapshot?.outputs),
        WorkflowDetailPresenter.getPinnedOutputsByPort(currentExecutionState, nodeId),
      );
      const baseItems = pinnedOutput ?? visibleEntries.find(([portName]) => portName === outputPort)?.[1];
      return {
        mode: "pin-output",
        title: `Edit output for ${WorkflowDetailPresenter.getNodeDisplayName(workflowNode, nodeId)} · ${outputPort}`,
        value: WorkflowDetailPresenter.toPinOutputEditorJson(baseItems),
        workflowId,
        nodeId,
        outputPort,
        binaryMapsByItemIndex: WorkflowDetailPresenter.extractBinaryMapsFromItems(baseItems),
      };
    },
    [currentExecutionState, displayedWorkflow, viewContext, workflowId],
  );

  const commitPinEdit = useCallback(
    (nodeId: string, outputPort: string, items: Items | undefined): Promise<void> => {
      if (viewContext !== "live-workflow") return Promise.resolve();
      const nextCurrentState = createOverlayCurrentStateWithOutputPortPin(nodeId, outputPort, items);
      return replaceDebuggerOverlay(nextCurrentState);
    },
    [createOverlayCurrentStateWithOutputPortPin, replaceDebuggerOverlay, viewContext],
  );

  const clearPinnedOutput = useCallback(
    (nodeId: string, outputPort: string) => {
      if (viewContext !== "live-workflow") return;
      const nextCurrentState = createOverlayCurrentStateWithOutputPortPin(nodeId, outputPort, undefined);
      void replaceDebuggerOverlay(nextCurrentState);
    },
    [createOverlayCurrentStateWithOutputPortPin, replaceDebuggerOverlay, viewContext],
  );

  return {
    resolveOutputPortForNode,
    togglePinnedOutput,
    buildPinEditorState,
    commitPinEdit,
    clearPinnedOutput,
  };
}
