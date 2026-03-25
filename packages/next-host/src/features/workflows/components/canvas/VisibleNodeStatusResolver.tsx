import type { ConnectionInvocationRecord, NodeExecutionSnapshot } from "../../hooks/realtime/realtime";

export class VisibleNodeStatusResolver {
  private static readonly statusPriorityByStatus = new Map<NodeExecutionSnapshot["status"], number>([
    ["running", 0],
    ["queued", 1],
    ["completed", 2],
    ["failed", 3],
    ["skipped", 4],
    ["pending", 5],
  ]);

  private static readonly invocationWorstStatusOrder = [
    "failed",
    "running",
    "queued",
    "completed",
    "skipped",
    "pending",
  ] as const;

  static resolveStatuses(
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>,
    connectionInvocations?: ReadonlyArray<ConnectionInvocationRecord>,
  ): Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>> {
    const snapshotsByVisibleNodeId = new Map<string, NodeExecutionSnapshot[]>();
    for (const [nodeId, snapshot] of Object.entries(nodeSnapshotsByNodeId)) {
      const snapshots = snapshotsByVisibleNodeId.get(nodeId) ?? [];
      snapshots.push(snapshot);
      snapshotsByVisibleNodeId.set(nodeId, snapshots);
    }

    const statusEntries: Array<readonly [string, NodeExecutionSnapshot["status"]]> = [];
    for (const [visibleNodeId, snapshots] of snapshotsByVisibleNodeId.entries()) {
      const resolvedSnapshot = [...snapshots].sort((left, right) => this.compareSnapshots(left, right))[0];
      if (resolvedSnapshot) {
        statusEntries.push([visibleNodeId, resolvedSnapshot.status] as const);
      }
    }
    const result = Object.fromEntries(statusEntries) as Record<string, NodeExecutionSnapshot["status"] | undefined>;
    const invocationsByConnectionNodeId = new Map<string, ConnectionInvocationRecord[]>();
    for (const inv of connectionInvocations ?? []) {
      const list = invocationsByConnectionNodeId.get(inv.connectionNodeId) ?? [];
      list.push(inv);
      invocationsByConnectionNodeId.set(inv.connectionNodeId, list);
    }
    for (const [connectionNodeId, invs] of invocationsByConnectionNodeId.entries()) {
      const aggregated = this.worstInvocationStatus(invs.map((entry) => entry.status));
      if (aggregated) {
        result[connectionNodeId] = aggregated;
      }
    }
    return result;
  }

  private static worstInvocationStatus(
    statuses: ReadonlyArray<NodeExecutionSnapshot["status"]>,
  ): NodeExecutionSnapshot["status"] | undefined {
    if (statuses.length === 0) {
      return undefined;
    }
    let best: NodeExecutionSnapshot["status"] | undefined;
    let bestIdx: number = this.invocationWorstStatusOrder.length;
    for (const status of statuses) {
      const idx = this.invocationWorstStatusOrder.indexOf(status);
      const resolvedIdx = idx >= 0 ? idx : this.invocationWorstStatusOrder.length;
      if (resolvedIdx < bestIdx) {
        bestIdx = resolvedIdx;
        best = status;
      }
    }
    return best ?? statuses[0];
  }

  private static compareSnapshots(left: NodeExecutionSnapshot, right: NodeExecutionSnapshot): number {
    const statusPriorityComparison = this.getStatusPriority(left.status) - this.getStatusPriority(right.status);
    if (statusPriorityComparison !== 0) return statusPriorityComparison;
    return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
  }

  private static getStatusPriority(status: NodeExecutionSnapshot["status"]): number {
    return this.statusPriorityByStatus.get(status) ?? Number.MAX_SAFE_INTEGER;
  }
}
