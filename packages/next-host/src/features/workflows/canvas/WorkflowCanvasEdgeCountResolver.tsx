



import { AgentAttachmentNodeIdFactory } from "@codemation/core/browser";



import type { NodeExecutionSnapshot } from "../realtime/realtime";




export class WorkflowCanvasEdgeCountResolver {
  static resolveCount(args: Readonly<{
    targetNodeId: string;
    targetNodeRole: string | undefined;
    targetInput: string;
    sourceOutput: string;
    sourceSnapshot: NodeExecutionSnapshot | undefined;
    targetSnapshot: NodeExecutionSnapshot | undefined;
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
  }>): number {
    if (args.targetNodeRole === "languageModel" || args.targetNodeRole === "tool") {
      const attachmentInvocationCount = this.resolveAttachmentInvocationCount(args.targetNodeId, args.targetNodeRole, args.nodeSnapshotsByNodeId);
      if (attachmentInvocationCount > 0) return attachmentInvocationCount;
    }

    const targetInputItems = args.targetSnapshot?.inputsByPort?.[args.targetInput];
    const sourceOutputItems = args.sourceSnapshot?.outputs?.[args.sourceOutput];
    return targetInputItems?.length ?? sourceOutputItems?.length ?? 0;
  }

  private static resolveAttachmentInvocationCount(
    targetNodeId: string,
    targetNodeRole: string,
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>,
  ): number {
    return Object.values(nodeSnapshotsByNodeId).filter((snapshot) => {
      if (targetNodeRole === "languageModel") {
        return AgentAttachmentNodeIdFactory.getBaseLanguageModelNodeId(snapshot.nodeId) === targetNodeId;
      }
      if (targetNodeRole === "tool") {
        return AgentAttachmentNodeIdFactory.getBaseToolNodeId(snapshot.nodeId) === targetNodeId;
      }
      return false;
    }).length;
  }
}
