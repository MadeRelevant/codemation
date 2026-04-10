import type { ConnectionInvocationRecord, NodeExecutionSnapshot } from "../../../lib/realtime/realtimeDomainTypes";

export class WorkflowCanvasEdgeCountResolver {
  static resolveCount(
    args: Readonly<{
      sourceNodeId: string;
      targetNodeId: string;
      targetNodeRole: string | undefined;
      targetInput: string;
      sourceOutput: string;
      sourceSnapshot: NodeExecutionSnapshot | undefined;
      targetSnapshot: NodeExecutionSnapshot | undefined;
      nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
      connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>;
    }>,
  ): number {
    if (
      args.targetNodeRole === "languageModel" ||
      args.targetNodeRole === "tool" ||
      args.targetNodeRole === "nestedAgent"
    ) {
      const attachmentInvocationCount = this.resolveAttachmentInvocationCount(
        args.targetNodeId,
        args.targetNodeRole,
        args.nodeSnapshotsByNodeId,
        args.connectionInvocations,
      );
      if (attachmentInvocationCount > 0) return attachmentInvocationCount;
    }

    const impliedCollectKey = `${args.sourceNodeId}:${args.sourceOutput}`;
    const targetInputItems =
      args.targetSnapshot?.inputsByPort?.[args.targetInput] ?? args.targetSnapshot?.inputsByPort?.[impliedCollectKey];
    const sourceOutputItems = args.sourceSnapshot?.outputs?.[args.sourceOutput];
    return targetInputItems?.length ?? sourceOutputItems?.length ?? 0;
  }

  private static resolveAttachmentInvocationCount(
    targetNodeId: string,
    targetNodeRole: string,
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>,
    connectionInvocations: ReadonlyArray<ConnectionInvocationRecord>,
  ): number {
    const fromHistory = connectionInvocations.filter((inv) => inv.connectionNodeId === targetNodeId).length;
    if (fromHistory > 0) {
      return fromHistory;
    }
    return Object.values(nodeSnapshotsByNodeId).filter((snapshot) => {
      if (targetNodeRole === "languageModel") {
        return snapshot.nodeId === targetNodeId;
      }
      if (targetNodeRole === "tool" || targetNodeRole === "nestedAgent") {
        return snapshot.nodeId === targetNodeId;
      }
      return false;
    }).length;
  }
}
