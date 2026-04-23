import type { Edge as ReactFlowEdge, Node as ReactFlowNode } from "@xyflow/react";
import { useEffect, useState } from "react";

import { layoutWorkflow } from "../../components/canvas/lib/layoutWorkflow";
import type { WorkflowCanvasNodeData } from "../../components/canvas/lib/workflowCanvasNodeData";
import type { ConnectionInvocationRecord, NodeExecutionSnapshot } from "../../lib/realtime/realtimeDomainTypes";
import type { WorkflowDto } from "../../lib/realtime/workflowTypes";

/**
 * Thin React hook that awaits the async ELK-backed `layoutWorkflow` and keeps
 * the returned React Flow nodes/edges in component state. Stale resolutions
 * (e.g. when the user switches workflows mid-layout) are discarded via a
 * per-effect cancellation flag so React Flow is never fed an older positioning
 * after a newer one has already landed.
 *
 * First-paint returns empty arrays; `WorkflowCanvas` already gates viewport-fit
 * on `isInitialViewportReady`, so the canvas stays blank until ELK resolves
 * instead of flashing stale positions.
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
  } = args;
  const [layoutResult, setLayoutResult] = useState<{
    nodes: ReactFlowNode<WorkflowCanvasNodeData>[];
    edges: ReactFlowEdge[];
  }>({ nodes: [], edges: [] });
  useEffect(() => {
    let cancelled = false;
    void layoutWorkflow(
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
    ).then((resolved) => {
      if (cancelled) return;
      setLayoutResult({ nodes: [...resolved.nodes], edges: [...resolved.edges] });
    });
    return () => {
      cancelled = true;
    };
  }, [
    connectionInvocations,
    credentialAttentionTooltipByNodeId,
    isLiveWorkflowView,
    isRunning,
    nodeSnapshotsByNodeId,
    onClearPinnedOutput,
    onEditNodeOutput,
    onOpenPropertiesNode,
    onRequestOpenCredentialEditForNode,
    onRunNode,
    onSelectNode,
    onTogglePinnedOutput,
    pinnedNodeIds,
    propertiesTargetNodeId,
    selectedNodeId,
    visibleNodeStatusesByNodeId,
    workflow,
    workflowNodeIdsWithBoundCredential,
  ]);
  return layoutResult;
}
