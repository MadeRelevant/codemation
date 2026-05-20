import type { WorkflowDto } from "@codemation/host/dto";

import type { NodeExecutionSnapshot } from "../../realtime/realtimeDomainTypes";
import { SNAPSHOT_STATUS_RANK } from "../../realtime/realtimeRunMutations";

// Attachment-edge roles: target-side roles that indicate the edge is not a
// sequential predecessor (same convention used in the patch planner).
const ATTACHMENT_ROLES = new Set(["languageModel", "tool", "nestedAgent"]);

// Pre-terminal threshold: ranks strictly below this value are "not yet done".
// completed=3, skipped=3, failed=4 are all terminal.
const TERMINAL_RANK = 3;

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
      const engineRank = engineStatus !== undefined ? SNAPSHOT_STATUS_RANK[engineStatus] : 0;

      const upstreams = upstreamsByNodeId.get(nodeId) ?? new Set();
      if (upstreams.size === 0) {
        // No sequential upstreams: display engine status as-is
        displayedRankByNodeId.set(nodeId, engineRank);
        displayed[nodeId] = engineStatus;
        continue;
      }

      // Find the minimum rank among non-terminal upstreams
      // Skip cycle nodes as upstreams (they don't have valid displayed ranks yet)
      let minNonTerminalRank: number | undefined;
      for (const upstreamId of upstreams) {
        if (cycleNodeIds.has(upstreamId)) continue;
        const upstreamRank = displayedRankByNodeId.get(upstreamId) ?? 0;
        if (upstreamRank < TERMINAL_RANK) {
          if (minNonTerminalRank === undefined || upstreamRank < minNonTerminalRank) {
            minNonTerminalRank = upstreamRank;
          }
        }
      }

      if (minNonTerminalRank === undefined) {
        // All (non-cycle) upstreams are terminal: show engine status
        displayedRankByNodeId.set(nodeId, engineRank);
        displayed[nodeId] = engineStatus;
      } else {
        // Cap: clamp to min(engineRank, minNonTerminalRank), but only pre-terminal values
        const cappedRank = Math.min(engineRank, minNonTerminalRank);
        displayedRankByNodeId.set(nodeId, cappedRank);
        if (engineStatus === undefined) {
          // Undefined engine status stays undefined even if rank differs
          displayed[nodeId] = undefined;
        } else if (cappedRank < TERMINAL_RANK) {
          displayed[nodeId] = RANK_TO_STATUS[cappedRank] ?? "running";
        } else {
          displayed[nodeId] = engineStatus;
        }
      }
    }

    // Cycle nodes fall through untouched — use engine status directly
    for (const nodeId of cycleNodeIds) {
      displayed[nodeId] = statusByNodeId[nodeId];
    }

    return displayed;
  }
}
