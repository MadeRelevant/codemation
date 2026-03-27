import type { NodeId, NodeOutputs, RunCurrentState } from "../../types";

export class PinnedOutputResolver {
  constructor(private readonly currentState: RunCurrentState) {}

  overlayPinnedOutputs(): RunCurrentState {
    const outputsByNode: Record<NodeId, NodeOutputs> = { ...this.currentState.outputsByNode };
    for (const [nodeId, nodeState] of Object.entries(this.currentState.mutableState?.nodesById ?? {}) as Array<
      [NodeId, NonNullable<RunCurrentState["mutableState"]>["nodesById"][NodeId]]
    >) {
      const pinnedOutputs = this.resolvePinnedOutputs(nodeState);
      if (!pinnedOutputs) {
        continue;
      }
      outputsByNode[nodeId] = pinnedOutputs;
    }
    return {
      outputsByNode,
      nodeSnapshotsByNodeId: { ...this.currentState.nodeSnapshotsByNodeId },
      mutableState: this.currentState.mutableState,
    };
  }

  hasPinnedOutputs(nodeId: NodeId): boolean {
    return this.getPinnedOutputs(nodeId) !== undefined;
  }

  getPinnedOutputs(nodeId: NodeId): NodeOutputs | undefined {
    const nodeState = this.currentState.mutableState?.nodesById?.[nodeId];
    return this.resolvePinnedOutputs(nodeState);
  }

  private resolvePinnedOutputs(
    nodeState: NonNullable<RunCurrentState["mutableState"]>["nodesById"][NodeId] | undefined,
  ): NodeOutputs | undefined {
    if (!nodeState) {
      return undefined;
    }
    return nodeState.pinnedOutputsByPort;
  }
}
