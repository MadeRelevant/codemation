"use client";
import type { Edge as ReactFlowEdge, Node as ReactFlowNode } from "@xyflow/react";
import { useRef } from "react";

import type { WorkflowDto } from "@codemation/host/dto";
import { WorkflowElkResultMapper } from "../../canvas-lib/elk/WorkflowElkResultMapper";
import { WorkflowCanvasReactFlowResultStabilizer } from "../../canvas-lib/elk/WorkflowCanvasReactFlowResultStabilizer";
import type { WorkflowCanvasNodeData } from "../../canvas-lib/workflowCanvasNodeData";
import type { ConnectionInvocationRecord, NodeExecutionSnapshot } from "../../realtime/realtimeDomainTypes";
import type { WorkflowCanvasConfig } from "../../types/WorkflowCanvasConfig";
import { useWorkflowElkLayout } from "./useWorkflowElkLayout";

const EMPTY_RESULT: Readonly<{ nodes: ReactFlowNode<WorkflowCanvasNodeData>[]; edges: ReactFlowEdge[] }> = {
  nodes: [],
  edges: [],
};

/**
 * Thin React hook that runs the async ELK layout (once per workflow structure)
 * and then synchronously overlays runtime state (snapshots, selection, etc.)
 * via `WorkflowElkResultMapper.toReactFlow`. Reference-stable output nodes/edges
 * are produced by `WorkflowCanvasReactFlowResultStabilizer` so unchanged items
 * keep their prev references and React Flow's internal memo skips them.
 */
export function useAsyncWorkflowLayout(args: {
  workflow: WorkflowDto;
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
  connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>;
  visibleNodeStatusesByNodeId: Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>>;
  credentialAttentionTooltipByNodeId: ReadonlyMap<string, string>;
  selectedNodeId: string | null;
  propertiesTargetNodeId: string | null;
  pinnedNodeIds: ReadonlySet<string>;
  isLiveWorkflowView: boolean;
  isRunning: boolean;
  workflowNodeIdsWithBoundCredential: ReadonlySet<string>;
  onSelectNode: (nodeId: string) => void;
  onOpenPropertiesNode: (nodeId: string) => void;
  onRequestOpenCredentialEditForNode: (nodeId: string) => void;
  onRunNode: (nodeId: string) => void;
  onTogglePinnedOutput: (nodeId: string) => void;
  onEditNodeOutput: (nodeId: string) => void;
  onClearPinnedOutput: (nodeId: string) => void;
  config?: WorkflowCanvasConfig;
}): Readonly<{ nodes: ReactFlowNode<WorkflowCanvasNodeData>[]; edges: ReactFlowEdge[] }> {
  const {
    workflow,
    nodeSnapshotsByNodeId,
    connectionInvocations,
    visibleNodeStatusesByNodeId,
    credentialAttentionTooltipByNodeId,
    selectedNodeId,
    propertiesTargetNodeId,
    pinnedNodeIds,
    isLiveWorkflowView,
    isRunning,
    workflowNodeIdsWithBoundCredential,
    onSelectNode,
    onOpenPropertiesNode,
    onRequestOpenCredentialEditForNode,
    onRunNode,
    onTogglePinnedOutput,
    onEditNodeOutput,
    onClearPinnedOutput,
    config,
  } = args;

  const positionedLayout = useWorkflowElkLayout(workflow, config);
  const prevResultRef =
    useRef<Readonly<{ nodes: ReactFlowNode<WorkflowCanvasNodeData>[]; edges: ReactFlowEdge[] }>>(EMPTY_RESULT);

  if (!positionedLayout) {
    return EMPTY_RESULT;
  }

  const fresh = WorkflowElkResultMapper.toReactFlow({
    positionedLayout,
    nodeSnapshotsByNodeId,
    connectionInvocations,
    nodeStatusesByNodeId: visibleNodeStatusesByNodeId,
    credentialAttentionTooltipByNodeId,
    selectedNodeId,
    propertiesTargetNodeId,
    pinnedNodeIds,
    isLiveWorkflowView,
    isRunning,
    workflowNodeIdsWithBoundCredential,
    onSelectNode,
    onOpenPropertiesNode,
    onRequestOpenCredentialEditForNode,
    onRunNode,
    onTogglePinnedOutput,
    onEditNodeOutput,
    onClearPinnedOutput,
  });

  const stable = WorkflowCanvasReactFlowResultStabilizer.stabilize(fresh, prevResultRef.current);
  prevResultRef.current = stable;
  return stable;
}
