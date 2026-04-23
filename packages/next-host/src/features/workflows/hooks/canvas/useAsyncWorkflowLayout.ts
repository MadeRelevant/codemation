import type { Edge as ReactFlowEdge, Node as ReactFlowNode } from "@xyflow/react";
import { useCallback, useEffect, useRef, useState } from "react";

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
 *
 * Callback props are routed through refs so their identity change does not
 * retrigger the async ELK layout. This guarantees that whenever a caller's
 * `onRunNode` closure is recreated (e.g. after `currentExecutionState` updates
 * post-pin), the canvas toolbar invokes the **latest** closure without waiting
 * for a relayout round-trip.
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

  const onSelectNodeRef = useRef(onSelectNode);
  const onOpenPropertiesNodeRef = useRef(onOpenPropertiesNode);
  const onRequestOpenCredentialEditForNodeRef = useRef(onRequestOpenCredentialEditForNode);
  const onRunNodeRef = useRef(onRunNode);
  const onTogglePinnedOutputRef = useRef(onTogglePinnedOutput);
  const onEditNodeOutputRef = useRef(onEditNodeOutput);
  const onClearPinnedOutputRef = useRef(onClearPinnedOutput);
  useEffect(() => {
    onSelectNodeRef.current = onSelectNode;
    onOpenPropertiesNodeRef.current = onOpenPropertiesNode;
    onRequestOpenCredentialEditForNodeRef.current = onRequestOpenCredentialEditForNode;
    onRunNodeRef.current = onRunNode;
    onTogglePinnedOutputRef.current = onTogglePinnedOutput;
    onEditNodeOutputRef.current = onEditNodeOutput;
    onClearPinnedOutputRef.current = onClearPinnedOutput;
  }, [
    onClearPinnedOutput,
    onEditNodeOutput,
    onOpenPropertiesNode,
    onRequestOpenCredentialEditForNode,
    onRunNode,
    onSelectNode,
    onTogglePinnedOutput,
  ]);

  const stableOnSelectNode = useCallback((nodeId: string) => onSelectNodeRef.current(nodeId), []);
  const stableOnOpenPropertiesNode = useCallback((nodeId: string) => onOpenPropertiesNodeRef.current(nodeId), []);
  const stableOnRequestOpenCredentialEditForNode = useCallback(
    (nodeId: string) => onRequestOpenCredentialEditForNodeRef.current(nodeId),
    [],
  );
  const stableOnRunNode = useCallback((nodeId: string) => onRunNodeRef.current(nodeId), []);
  const stableOnTogglePinnedOutput = useCallback((nodeId: string) => onTogglePinnedOutputRef.current(nodeId), []);
  const stableOnEditNodeOutput = useCallback((nodeId: string) => onEditNodeOutputRef.current(nodeId), []);
  const stableOnClearPinnedOutput = useCallback((nodeId: string) => onClearPinnedOutputRef.current(nodeId), []);

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
      stableOnSelectNode,
      stableOnOpenPropertiesNode,
      stableOnRequestOpenCredentialEditForNode,
      stableOnRunNode,
      stableOnTogglePinnedOutput,
      stableOnEditNodeOutput,
      stableOnClearPinnedOutput,
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
    pinnedNodeIds,
    propertiesTargetNodeId,
    selectedNodeId,
    stableOnClearPinnedOutput,
    stableOnEditNodeOutput,
    stableOnOpenPropertiesNode,
    stableOnRequestOpenCredentialEditForNode,
    stableOnRunNode,
    stableOnSelectNode,
    stableOnTogglePinnedOutput,
    visibleNodeStatusesByNodeId,
    workflow,
    workflowNodeIdsWithBoundCredential,
  ]);
  return layoutResult;
}
