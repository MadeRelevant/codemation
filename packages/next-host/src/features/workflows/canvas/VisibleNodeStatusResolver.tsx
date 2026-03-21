



import { AgentAttachmentNodeIdFactory } from "@codemation/core/browser";



import type { NodeExecutionSnapshot } from "../realtime/realtime";




export class VisibleNodeStatusResolver {
  private static readonly statusPriorityByStatus = new Map<NodeExecutionSnapshot["status"], number>([
    ["running", 0],
    ["queued", 1],
    ["completed", 2],
    ["failed", 3],
    ["skipped", 4],
    ["pending", 5],
  ]);

  static resolveStatuses(
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>,
  ): Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>> {
    const snapshotsByVisibleNodeId = new Map<string, NodeExecutionSnapshot[]>();
    for (const [nodeId, snapshot] of Object.entries(nodeSnapshotsByNodeId)) {
      const visibleNodeId = this.resolveVisibleNodeId(nodeId);
      const snapshots = snapshotsByVisibleNodeId.get(visibleNodeId) ?? [];
      snapshots.push(snapshot);
      snapshotsByVisibleNodeId.set(visibleNodeId, snapshots);
    }

    const statusEntries: Array<readonly [string, NodeExecutionSnapshot["status"]]> = [];
    for (const [visibleNodeId, snapshots] of snapshotsByVisibleNodeId.entries()) {
      const resolvedSnapshot = [...snapshots].sort((left, right) => this.compareSnapshots(left, right))[0];
      if (resolvedSnapshot) {
        statusEntries.push([visibleNodeId, resolvedSnapshot.status] as const);
      }
    }
    return Object.fromEntries(statusEntries);
  }

  private static resolveVisibleNodeId(nodeId: string): string {
    const languageModelNodeId = AgentAttachmentNodeIdFactory.getBaseLanguageModelNodeId(nodeId);
    if (languageModelNodeId !== nodeId) return languageModelNodeId;
    return AgentAttachmentNodeIdFactory.getBaseToolNodeId(nodeId);
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
