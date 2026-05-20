import type { WorkflowDto } from "@codemation/host/dto";

import type { NodeExecutionSnapshot } from "../../realtime/realtimeDomainTypes";
import { SNAPSHOT_STATUS_RANK } from "../../realtime/realtimeRunMutations";

// Attachment-edge roles: target-side roles that indicate the edge is not a
// sequential predecessor (same convention used in the patch planner).
const ATTACHMENT_ROLES = new Set(["languageModel", "tool", "nestedAgent"]);

// Blocking statuses: only upstreams that are ACTIVELY in flight (queued or
// running) hold back downstream completion. Pending / undefined ("no snapshot
// emitted yet") DOES NOT block — that case arises for nodes in an unused
// branch of an `.if()` where the engine never activates them. Without this
// distinction, the cap would freeze a fan-in node's display forever whenever
// any incoming branch was not taken.
const RANK_QUEUED = 1;
const RANK_RUNNING = 2;

const RANK_TO_STATUS: Readonly<Record<number, NodeExecutionSnapshot["status"]>> = {
  0: "pending",
  1: "queued",
  2: "running",
};

/**
 * Pure, read-only projection that caps the displayed status of each canvas
 * node so that no node visually completes before ALL its sequential upstream
 * predecessors have reached a terminal state (completed / failed / skipped).
 *
 * This is a visualization-only layer.  It never mutates the snapshot cache,
 * the engine state, or any input structure.
 */
export class WorkflowCanvasTopologicalStatusCap {
  /**
   * Given the engine-status of every node in the workflow, return the
   * displayed-status for every node — capped so a node never appears more
   * progressed than its upstream(s).
   *
   * Nodes with `undefined` engine status are treated as rank-0 (pending) for
   * cap arithmetic but their output entry remains `undefined` (we never
   * fabricate a status that the engine hasn't emitted).
   */
  static applyCap(
    args: Readonly<{
      workflow: WorkflowDto;
      statusByNodeId: Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>>;
    }>,
  ): Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>> {
    const { workflow, statusByNodeId } = args;

    // Build adjacency: upstreamsByNodeId[N] = Set of node ids that are direct
    // sequential predecessors of N. Attachment edges are excluded.
    const upstreamsByNodeId = new Map<string, Set<string>>();
    for (const node of workflow.nodes) {
      upstreamsByNodeId.set(node.id, new Set());
    }
    const inDegree = new Map<string, number>();
    for (const node of workflow.nodes) {
      inDegree.set(node.id, 0);
    }

    for (const edge of workflow.edges) {
      const targetNode = workflow.nodes.find((n) => n.id === edge.to.nodeId);
      if (targetNode?.role && ATTACHMENT_ROLES.has(targetNode.role)) {
        // Skip attachment edges — they are not sequential predecessors
        continue;
      }
      const upstreams = upstreamsByNodeId.get(edge.to.nodeId);
      if (upstreams && workflow.nodes.some((n) => n.id === edge.from.nodeId)) {
        if (!upstreams.has(edge.from.nodeId)) {
          upstreams.add(edge.from.nodeId);
          inDegree.set(edge.to.nodeId, (inDegree.get(edge.to.nodeId) ?? 0) + 1);
        }
      }
    }

    // Kahn's topological sort
    const topoOrder: string[] = [];
    const queue: string[] = [];
    const remaining = new Map(inDegree);

    for (const [nodeId, degree] of remaining) {
      if (degree === 0) queue.push(nodeId);
    }

    const outgoingsByNodeId = new Map<string, string[]>();
    for (const node of workflow.nodes) {
      outgoingsByNodeId.set(node.id, []);
    }
    for (const edge of workflow.edges) {
      const targetNode = workflow.nodes.find((n) => n.id === edge.to.nodeId);
      if (targetNode?.role && ATTACHMENT_ROLES.has(targetNode.role)) continue;
      const outs = outgoingsByNodeId.get(edge.from.nodeId);
      if (outs && workflow.nodes.some((n) => n.id === edge.to.nodeId)) {
        outs.push(edge.to.nodeId);
      }
    }

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      topoOrder.push(nodeId);
      for (const successor of outgoingsByNodeId.get(nodeId) ?? []) {
        const newDegree = (remaining.get(successor) ?? 0) - 1;
        remaining.set(successor, newDegree);
        if (newDegree === 0) queue.push(successor);
      }
    }

    // Track which nodes are in cycles (not reachable via topo sort)
    const topoSet = new Set(topoOrder);
    const cycleNodeIds = new Set<string>();
    for (const node of workflow.nodes) {
      if (!topoSet.has(node.id)) {
        cycleNodeIds.add(node.id);
      }
    }

    // Walk in topological order, computing displayed status
    const displayedRankByNodeId = new Map<string, number>();
    const displayed: Record<string, NodeExecutionSnapshot["status"] | undefined> = {};

    for (const nodeId of topoOrder) {
      const engineStatus = statusByNodeId[nodeId];
      // engineRank is -1 when no snapshot exists (undefined). We track that
      // separately from "rank 0 / pending" because an unset snapshot must not
      // contribute a "rank 0" floor to downstream caps.
      const engineRank = engineStatus !== undefined ? SNAPSHOT_STATUS_RANK[engineStatus] : -1;

      const upstreams = upstreamsByNodeId.get(nodeId) ?? new Set();
      if (upstreams.size === 0) {
        // No sequential upstreams: display engine status as-is
        displayedRankByNodeId.set(nodeId, engineRank);
        displayed[nodeId] = engineStatus;
        continue;
      }

      // Block on the LOWEST in-flight upstream (queued=1 or running=2). Every
      // other state — pending, undefined, completed, skipped, failed — is
      // non-blocking. A node in an unused `.if()` branch never emits a
      // snapshot, so its rank stays -1 and won't hold up its downstream
      // fan-in.
      let minBlockingRank: number | undefined;
      for (const upstreamId of upstreams) {
        if (cycleNodeIds.has(upstreamId)) continue;
        const upstreamRank = displayedRankByNodeId.get(upstreamId);
        if (upstreamRank === undefined) continue;
        if (upstreamRank !== RANK_QUEUED && upstreamRank !== RANK_RUNNING) continue;
        if (minBlockingRank === undefined || upstreamRank < minBlockingRank) {
          minBlockingRank = upstreamRank;
        }
      }

      if (minBlockingRank === undefined) {
        // No upstream is actively in flight — display engine status as-is.
        displayedRankByNodeId.set(nodeId, engineRank);
        displayed[nodeId] = engineStatus;
      } else if (engineRank < 0 || engineRank < minBlockingRank) {
        // Engine status is not progressed enough to be capped: pass through.
        displayedRankByNodeId.set(nodeId, engineRank);
        displayed[nodeId] = engineStatus;
      } else {
        // Engine wants to show "more progressed" than an in-flight upstream
        // allows. Clamp display to the blocking upstream's rank.
        displayedRankByNodeId.set(nodeId, minBlockingRank);
        displayed[nodeId] = RANK_TO_STATUS[minBlockingRank] ?? "running";
      }
    }

    // Cycle nodes fall through untouched — use engine status directly
    for (const nodeId of cycleNodeIds) {
      displayed[nodeId] = statusByNodeId[nodeId];
    }

    return displayed;
  }
}
