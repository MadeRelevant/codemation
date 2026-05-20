import type { Edge as ReactFlowEdge, Node as ReactFlowNode, EdgeReplaceChange, NodeReplaceChange } from "@xyflow/react";

import type { WorkflowDto } from "@codemation/host/dto";
import type { ConnectionInvocationRecord, NodeExecutionSnapshot } from "../../realtime/realtimeDomainTypes";
import { WorkflowCanvasEdgeCountResolver } from "../WorkflowCanvasEdgeCountResolver";
import { WorkflowCanvasEdgeStyleResolver } from "../WorkflowCanvasEdgeStyleResolver";
import type { WorkflowCanvasNodeData } from "../workflowCanvasNodeData";
import { WorkflowCanvasTopologicalStatusCap } from "./WorkflowCanvasTopologicalStatusCap";

export type WorkflowCanvasRealtimePatch = Readonly<{
  nodeChanges: NodeReplaceChange[];
  edgeChanges: EdgeReplaceChange[];
}>;

/**
 * Computes minimal React Flow `replace` changes when realtime snapshot state
 * transitions between renders.  Only the nodes/edges whose VISIBLE state
 * (status, source-output item counts, edge stroke/label) actually changed are
 * included in the result.
 *
 * Short-circuit: when `prevSnapshots === nextSnapshots` the result is always
 * empty (the caller's referential-stability guarantee from
 * `mergeSnapshotMonotonic` fires here — no object allocation at all).
 *
 * Logging: emits `[canvas-update] applied node=X ...` / `[canvas-update] skipped
 * node=X reason=no-change` to `console.info` so the Playwright scripts can
 * count applied vs skipped updates.  These logs live only in browser bundles
 * (`packages/canvas`), not server-side code — the ESLint `no-console` rule does
 * not apply to the canvas/canvas-core packages.
 */
export class WorkflowCanvasRealtimePatchPlanner {
  static plan(
    args: Readonly<{
      workflow: WorkflowDto;
      prevSnapshots: Readonly<Record<string, NodeExecutionSnapshot>>;
      nextSnapshots: Readonly<Record<string, NodeExecutionSnapshot>>;
      prevConnectionInvocations: ReadonlyArray<ConnectionInvocationRecord>;
      nextConnectionInvocations: ReadonlyArray<ConnectionInvocationRecord>;
      currentNodes: ReadonlyArray<ReactFlowNode<WorkflowCanvasNodeData>>;
      currentEdges: ReadonlyArray<ReactFlowEdge>;
      /**
       * Snapshot of the displayed status map from the previous plan() call.
       * Threaded into the topological cap so that nodes which have already
       * reached a terminal display state are not downgraded when convergent
       * branches activate later in the run.
       */
      previouslyDisplayedByNodeId?: Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>>;
    }>,
  ): WorkflowCanvasRealtimePatch & {
    displayedByNodeId: Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>>;
  } {
    const {
      workflow,
      prevSnapshots,
      nextSnapshots,
      prevConnectionInvocations,
      nextConnectionInvocations,
      currentNodes,
      currentEdges,
      previouslyDisplayedByNodeId,
    } = args;

    // Short-circuit: same reference means nothing changed (monotonic merge guarantee)
    if (prevSnapshots === nextSnapshots && prevConnectionInvocations === nextConnectionInvocations) {
      return {
        nodeChanges: [],
        edgeChanges: [],
        displayedByNodeId: previouslyDisplayedByNodeId ?? {},
      };
    }

    // Compute topological-cap displayed statuses. The cap ensures a node never
    // appears more progressed than its slowest in-flight upstream — AND, via
    // the `previouslyDisplayedByNodeId` ratchet, never visibly regresses once
    // it has reached a terminal display state.
    const prevEngineStatuses: Record<string, NodeExecutionSnapshot["status"] | undefined> = {};
    const nextEngineStatuses: Record<string, NodeExecutionSnapshot["status"] | undefined> = {};
    for (const nodeId of Object.keys(prevSnapshots)) {
      prevEngineStatuses[nodeId] = prevSnapshots[nodeId]?.status;
    }
    for (const nodeId of Object.keys(nextSnapshots)) {
      nextEngineStatuses[nodeId] = nextSnapshots[nodeId]?.status;
    }
    // `prevDisplayed` uses the ratchet so the diff baseline reflects what was
    // actually shown last round, not what a fresh topo-cap of `prevSnapshots`
    // would produce in isolation.
    const prevDisplayed = previouslyDisplayedByNodeId
      ? previouslyDisplayedByNodeId
      : WorkflowCanvasTopologicalStatusCap.applyCap({
          workflow,
          statusByNodeId: prevEngineStatuses,
        });
    const nextDisplayed = WorkflowCanvasTopologicalStatusCap.applyCap({
      workflow,
      statusByNodeId: nextEngineStatuses,
      previouslyDisplayedByNodeId: prevDisplayed,
    });

    const nodesById = new Map(currentNodes.map((n) => [n.id, n]));

    const nodeChanges: NodeReplaceChange[] = [];
    const edgeChanges: EdgeReplaceChange[] = [];
    // Track edges we've already emitted a change for (avoid duplicate changes
    // when both source and target node snapshots change for the same edge)
    const patchedEdgeIds = new Set<string>();

    // Build an index of edges per source/target node for fast lookup
    const outgoingEdgesByNodeId = new Map<string, ReactFlowEdge[]>();
    const incomingEdgesByNodeId = new Map<string, ReactFlowEdge[]>();
    for (const edge of currentEdges) {
      if (!outgoingEdgesByNodeId.has(edge.source)) {
        outgoingEdgesByNodeId.set(edge.source, []);
      }
      outgoingEdgesByNodeId.get(edge.source)!.push(edge);
      if (!incomingEdgesByNodeId.has(edge.target)) {
        incomingEdgesByNodeId.set(edge.target, []);
      }
      incomingEdgesByNodeId.get(edge.target)!.push(edge);
    }

    // Check every node id that appears in either prev or next snapshots
    const allChangedNodeIds = new Set([...Object.keys(prevSnapshots), ...Object.keys(nextSnapshots)]);
    for (const nodeId of allChangedNodeIds) {
      const prev = prevSnapshots[nodeId];
      const next = nextSnapshots[nodeId];

      // Use displayed (cap-adjusted) statuses for the visibility diff
      const prevDisplayedStatus = prevDisplayed[nodeId];
      const nextDisplayedStatus = nextDisplayed[nodeId];
      const displayedStatusChanged = prevDisplayedStatus !== nextDisplayedStatus;

      if (!displayedStatusChanged && !this.portCountsChanged(prev, next)) {
        console.info(`[canvas-update] skipped node=${nodeId} reason=no-change`);
        continue;
      }

      const currentNode = nodesById.get(nodeId);
      if (!currentNode) continue; // node not on canvas (e.g. attachment with no direct card)

      // Use the cap-adjusted displayed status for canvas rendering
      const newStatus = nextDisplayedStatus;
      const newSourceOutputPortCounts = this.computeSourceOutputPortCounts(
        nodeId,
        currentNode.data.sourceOutputPorts,
        nextSnapshots,
      );

      // `data.isRunning` is a workflow-level flag (true iff any run is active),
      // so the patch leaves it alone — `seedSignature` includes `isRunning` and
      // a full re-seed flips it across every node atomically when the workflow
      // toggles. Per-node "is this node running?" is exposed through `status`.
      const updatedNode: ReactFlowNode<WorkflowCanvasNodeData> = {
        ...currentNode,
        data: {
          ...currentNode.data,
          status: newStatus,
          sourceOutputPortCounts: newSourceOutputPortCounts,
          hasOutputData: Boolean(next?.outputs !== undefined || currentNode.data.isPinned),
        },
      };
      nodeChanges.push({ id: nodeId, item: updatedNode, type: "replace" });
      console.info(
        `[canvas-update] applied node=${nodeId} status=${newStatus ?? "undefined"} outgoing-edges-touched=${(outgoingEdgesByNodeId.get(nodeId) ?? []).length}`,
      );

      // Patch outgoing edges from this node
      for (const edge of outgoingEdgesByNodeId.get(nodeId) ?? []) {
        if (patchedEdgeIds.has(edge.id)) continue;
        const edgeChange = this.buildEdgeChange(edge, workflow, nextSnapshots, nextConnectionInvocations);
        if (edgeChange) {
          edgeChanges.push(edgeChange);
          patchedEdgeIds.add(edge.id);
        }
      }

      // Patch incoming edges to this node (target-side counts)
      for (const edge of incomingEdgesByNodeId.get(nodeId) ?? []) {
        if (patchedEdgeIds.has(edge.id)) continue;
        const edgeChange = this.buildEdgeChange(edge, workflow, nextSnapshots, nextConnectionInvocations);
        if (edgeChange) {
          edgeChanges.push(edgeChange);
          patchedEdgeIds.add(edge.id);
        }
      }
    }

    // Also patch edges when connection invocations changed (attachment edges)
    if (prevConnectionInvocations !== nextConnectionInvocations) {
      for (const edge of currentEdges) {
        if (patchedEdgeIds.has(edge.id)) continue;
        const targetNode = workflow.nodes.find((n) => n.id === edge.target);
        const targetRole = targetNode?.role;
        if (targetRole !== "languageModel" && targetRole !== "tool" && targetRole !== "nestedAgent") continue;
        const edgeChange = this.buildEdgeChange(edge, workflow, nextSnapshots, nextConnectionInvocations);
        if (edgeChange) {
          edgeChanges.push(edgeChange);
          patchedEdgeIds.add(edge.id);
        }
      }
    }

    return { nodeChanges, edgeChanges, displayedByNodeId: nextDisplayed };
  }

  /**
   * Returns true if port counts (outputs/inputs) differ between snapshots.
   * Used in combination with the displayed-status diff to decide whether
   * a node replace change is needed.
   */
  private static portCountsChanged(
    prev: NodeExecutionSnapshot | undefined,
    next: NodeExecutionSnapshot | undefined,
  ): boolean {
    if (prev === next) return false;
    if (!prev && !next) return false;
    if (!prev || !next) return true; // one appeared/disappeared
    if (!this.outputPortCountsEqual(prev.outputs, next.outputs)) return true;
    if (!this.outputPortCountsEqual(prev.inputsByPort, next.inputsByPort)) return true;
    return false;
  }

  /** @deprecated Use portCountsChanged + displayed-status diff instead. Kept for test compatibility. */
  private static snapshotVisiblyChanged(
    prev: NodeExecutionSnapshot | undefined,
    next: NodeExecutionSnapshot | undefined,
  ): boolean {
    if (prev === next) return false;
    if (!prev && !next) return false;
    if (!prev || !next) return true; // one appeared/disappeared
    if (prev.status !== next.status) return true;
    // Compare output port lengths (drives edge label counts)
    if (!this.outputPortCountsEqual(prev.outputs, next.outputs)) return true;
    if (!this.outputPortCountsEqual(prev.inputsByPort, next.inputsByPort)) return true;
    return false;
  }

  private static outputPortCountsEqual(
    a: Readonly<Record<string, ReadonlyArray<unknown>>> | undefined,
    b: Readonly<Record<string, ReadonlyArray<unknown>>> | undefined,
  ): boolean {
    if (a === b) return true;
    const aEntries = Object.entries(a ?? {}).filter(([, items]) => items.length > 0);
    const bEntries = Object.entries(b ?? {}).filter(([, items]) => items.length > 0);
    if (aEntries.length !== bEntries.length) return false;
    const bMap = new Map(bEntries.map(([k, v]) => [k, v.length]));
    for (const [k, v] of aEntries) {
      if (bMap.get(k) !== v.length) return false;
    }
    return true;
  }

  private static computeSourceOutputPortCounts(
    nodeId: string,
    sourceOutputPorts: readonly string[],
    snapshots: Readonly<Record<string, NodeExecutionSnapshot>>,
  ): Readonly<Record<string, number>> {
    const snapshot = snapshots[nodeId];
    return Object.fromEntries(
      sourceOutputPorts.map((portName) => [portName, snapshot?.outputs?.[portName]?.length ?? 0]),
    );
  }

  private static buildEdgeChange(
    edge: ReactFlowEdge,
    workflow: WorkflowDto,
    snapshots: Readonly<Record<string, NodeExecutionSnapshot>>,
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
  ): EdgeReplaceChange | null {
    const currentEdge = edge;
    const workflowEdge = this.findWorkflowEdgeForReactFlowEdge(edge, workflow);
    if (!workflowEdge) return null;

    const targetNode = workflow.nodes.find((n) => n.id === edge.target);
    const targetRole = targetNode?.role;
    const sourceSnapshot = snapshots[edge.source];
    const targetSnapshot = snapshots[edge.target];

    const edgeItemCount = WorkflowCanvasEdgeCountResolver.resolveCount({
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      targetNodeRole: targetRole,
      targetInput: workflowEdge.to.input,
      sourceOutput: workflowEdge.from.output,
      sourceSnapshot,
      targetSnapshot,
      nodeSnapshotsByNodeId: snapshots,
      connectionInvocations,
    });

    const isAttachmentEdge = targetRole === "languageModel" || targetRole === "tool" || targetRole === "nestedAgent";
    const edgeLabel = edgeItemCount > 0 ? `${edgeItemCount} item${edgeItemCount === 1 ? "" : "s"}` : undefined;
    const edgeStroke = WorkflowCanvasEdgeStyleResolver.resolveStrokeColor({ edgeItemCount, isAttachmentEdge });
    const labelFill = WorkflowCanvasEdgeStyleResolver.resolveLabelFill({ edgeItemCount, isAttachmentEdge });
    const labelBgFill = WorkflowCanvasEdgeStyleResolver.resolveLabelBackground({ edgeItemCount, isAttachmentEdge });

    // Check if anything actually changed
    if (
      currentEdge.label === edgeLabel &&
      (currentEdge.style as { stroke?: string } | undefined)?.stroke === edgeStroke &&
      (currentEdge.labelStyle as { fill?: string } | undefined)?.fill === labelFill &&
      (currentEdge.labelBgStyle as { fill?: string } | undefined)?.fill === labelBgFill
    ) {
      return null; // no visible change
    }

    const updatedEdge: ReactFlowEdge = {
      ...currentEdge,
      label: edgeLabel,
      style: { ...(currentEdge.style ?? {}), stroke: edgeStroke },
      labelStyle: { ...(currentEdge.labelStyle ?? {}), fill: labelFill },
      labelBgStyle: { ...(currentEdge.labelBgStyle ?? {}), fill: labelBgFill },
      ...(currentEdge.markerEnd && typeof currentEdge.markerEnd === "object"
        ? { markerEnd: { ...currentEdge.markerEnd, color: edgeStroke } }
        : {}),
    };
    return { id: edge.id, item: updatedEdge, type: "replace" };
  }

  private static findWorkflowEdgeForReactFlowEdge(
    rfEdge: ReactFlowEdge,
    workflow: WorkflowDto,
  ): (typeof workflow.edges)[number] | undefined {
    // React Flow edge id format: `{from.nodeId}:{from.output}->{to.nodeId}:{to.input}:{index}`
    // Parse it back to find the workflow edge
    return workflow.edges.find(
      (e) =>
        e.from.nodeId === rfEdge.source &&
        e.to.nodeId === rfEdge.target &&
        rfEdge.id.startsWith(`${e.from.nodeId}:${e.from.output}->${e.to.nodeId}:${e.to.input}:`),
    );
  }
}
