"use client";
import {
  type Edge as ReactFlowEdge,
  type Node as ReactFlowNode,
  applyEdgeChanges,
  applyNodeChanges,
} from "@xyflow/react";
import { useEffect, useRef } from "react";

import type { WorkflowDto } from "@codemation/host/dto";
import { WorkflowCanvasRealtimePatchPlanner } from "../../canvas-lib/realtime/WorkflowCanvasRealtimePatchPlanner";
import type { WorkflowCanvasNodeData } from "../../canvas-lib/workflowCanvasNodeData";
import type { ConnectionInvocationRecord, NodeExecutionSnapshot } from "../../realtime/realtimeDomainTypes";

/**
 * Watches realtime snapshot state and applies surgical React Flow `replace`
 * changes whenever a node's visible state (status, item counts, edge
 * stroke/label) changes.
 *
 * This hook owns the incremental update path.  The initial/seed nodes and
 * edges come from the ELK layout pass; this hook only patches them in-place
 * via `setNodes`/`setEdges` from the controlled `useNodesState`/`useEdgesState`
 * pair in `WorkflowCanvas`.
 *
 * `seedSignature` changes whenever the seed was replaced (ELK re-layout or
 * non-realtime state change).  The hook resets its "prev" tracking so stale
 * diffs do not produce spurious patches after a re-seed.
 */
export function useWorkflowCanvasRealtimePatches(
  args: Readonly<{
    workflow: WorkflowDto;
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>;
    seedSignature: string;
    /**
     * Stable getter — call `useCallback(() => nodesRef.current, [])` with a
     * local ref that tracks the latest nodes so this hook can read them without
     * putting the array in the deps and risking infinite loops.
     */
    getNodes: () => ReadonlyArray<ReactFlowNode<WorkflowCanvasNodeData>>;
    getEdges: () => ReadonlyArray<ReactFlowEdge>;
    setNodes: (
      value:
        | ReactFlowNode<WorkflowCanvasNodeData>[]
        | ((prev: ReactFlowNode<WorkflowCanvasNodeData>[]) => ReactFlowNode<WorkflowCanvasNodeData>[]),
    ) => void;
    setEdges: (value: ReactFlowEdge[] | ((prev: ReactFlowEdge[]) => ReactFlowEdge[])) => void;
  }>,
): void {
  const {
    workflow,
    nodeSnapshotsByNodeId,
    connectionInvocations,
    seedSignature,
    getNodes,
    getEdges,
    setNodes,
    setEdges,
  } = args;

  const prevSnapshotsRef = useRef<Readonly<Record<string, NodeExecutionSnapshot>>>({});
  const prevConnectionInvocationsRef = useRef<ReadonlyArray<ConnectionInvocationRecord>>([]);
  const prevDisplayedByNodeIdRef = useRef<Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>>>({});
  const prevSeedSignatureRef = useRef<string>("");

  // Reset "prev" tracking when the seed changes (ELK re-layout or non-realtime
  // state). The seed in `WorkflowCanvas` already paints the canvas with the
  // CURRENT realtime snapshots, so we align prev with that — otherwise the
  // first realtime event after a re-seed would diff against `{}` and emit
  // redundant `replace` changes for every node that was already seeded.
  useEffect(() => {
    if (prevSeedSignatureRef.current === seedSignature) return;
    prevSeedSignatureRef.current = seedSignature;
    prevSnapshotsRef.current = nodeSnapshotsByNodeId;
    prevConnectionInvocationsRef.current = connectionInvocations;
    // The topo-cap ratchet is per-run; clear it when the seed signature flips
    // (new workflow structure, new run boundary). Without this, a node that
    // showed `completed` in run #1 would refuse to ever drop to `running` on
    // a fresh run #2 of the same workflow id.
    prevDisplayedByNodeIdRef.current = {};
  }, [seedSignature, nodeSnapshotsByNodeId, connectionInvocations]);

  useEffect(() => {
    const prevSnapshots = prevSnapshotsRef.current;
    const prevConnectionInvocations = prevConnectionInvocationsRef.current;

    // Advance refs before computing patches so re-entrant calls see updated state
    prevSnapshotsRef.current = nodeSnapshotsByNodeId;
    prevConnectionInvocationsRef.current = connectionInvocations;

    const { nodeChanges, edgeChanges, displayedByNodeId } = WorkflowCanvasRealtimePatchPlanner.plan({
      workflow,
      prevSnapshots,
      nextSnapshots: nodeSnapshotsByNodeId,
      prevConnectionInvocations,
      nextConnectionInvocations: connectionInvocations,
      currentNodes: getNodes(),
      currentEdges: getEdges(),
      previouslyDisplayedByNodeId: prevDisplayedByNodeIdRef.current,
    });
    // Advance the ratchet so subsequent rounds can't downgrade what was
    // displayed this round.
    prevDisplayedByNodeIdRef.current = displayedByNodeId;

    if (nodeChanges.length > 0) {
      setNodes(
        (currentNodes) => applyNodeChanges(nodeChanges, currentNodes) as ReactFlowNode<WorkflowCanvasNodeData>[],
      );
    }
    if (edgeChanges.length > 0) {
      setEdges((currentEdges) => applyEdgeChanges(edgeChanges, currentEdges));
    }
  }, [workflow, nodeSnapshotsByNodeId, connectionInvocations, getNodes, getEdges, setNodes, setEdges]);
}
