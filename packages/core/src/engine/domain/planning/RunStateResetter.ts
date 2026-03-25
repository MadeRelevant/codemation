import type {
  ConnectionInvocationRecord,
  NodeId,
  NodeOutputs,
  RunCurrentState,
  RunStateResetRequest,
} from "../../../types";

import { ConnectionNodeIdFactory } from "../../../workflow/ConnectionNodeIdFactory";

import { PinnedOutputResolver } from "./PinnedOutputResolver";
import { WorkflowTopology } from "./WorkflowTopologyPlanner";

export class RunStateResetter {
  constructor(
    private readonly topology: WorkflowTopology,
    private readonly pinnedOutputResolver: PinnedOutputResolver,
  ) {}

  apply(args: { currentState: RunCurrentState; reset?: RunStateResetRequest }): Readonly<{
    currentState: RunCurrentState;
    clearedNodeIds: ReadonlyArray<NodeId>;
    preservedPinnedNodeIds: ReadonlyArray<NodeId>;
  }> {
    if (!args.reset) {
      return {
        currentState: args.currentState,
        clearedNodeIds: [],
        preservedPinnedNodeIds: [],
      };
    }

    const outputsByNode: Record<NodeId, NodeOutputs> = { ...args.currentState.outputsByNode };
    const nodeSnapshotsByNodeId = { ...args.currentState.nodeSnapshotsByNodeId };
    const clearedNodeIds: NodeId[] = [];
    const preservedPinnedNodeIds: NodeId[] = [];
    const descendants = this.collectDescendants(args.reset.clearFromNodeId);
    const runtimeDescendants = this.collectRuntimeDescendants(args.currentState, descendants);
    const clearedIdSet = new Set<NodeId>([...descendants, ...runtimeDescendants]);

    for (const nodeId of [...descendants, ...runtimeDescendants]) {
      if (this.pinnedOutputResolver.hasPinnedOutputs(nodeId)) {
        const pinnedOutputs = this.pinnedOutputResolver.getPinnedOutputs(nodeId);
        if (pinnedOutputs) {
          outputsByNode[nodeId] = pinnedOutputs;
        }
        delete nodeSnapshotsByNodeId[nodeId];
        preservedPinnedNodeIds.push(nodeId);
        continue;
      }
      delete outputsByNode[nodeId];
      delete nodeSnapshotsByNodeId[nodeId];
      clearedNodeIds.push(nodeId);
    }

    const connectionInvocations = this.filterConnectionInvocations(
      args.currentState.connectionInvocations,
      clearedIdSet,
    );

    return {
      currentState: {
        outputsByNode,
        nodeSnapshotsByNodeId,
        connectionInvocations,
        mutableState: args.currentState.mutableState,
      },
      clearedNodeIds,
      preservedPinnedNodeIds,
    };
  }

  private filterConnectionInvocations(
    invocations: ReadonlyArray<ConnectionInvocationRecord> | undefined,
    clearedIdSet: ReadonlySet<NodeId>,
  ): ReadonlyArray<ConnectionInvocationRecord> | undefined {
    if (!invocations || invocations.length === 0) {
      return invocations;
    }
    const kept = invocations.filter(
      (inv) => !clearedIdSet.has(inv.parentAgentNodeId) && !clearedIdSet.has(inv.connectionNodeId),
    );
    return kept.length === invocations.length ? invocations : kept;
  }

  private collectDescendants(startNodeId: NodeId): ReadonlyArray<NodeId> {
    const pendingNodeIds: NodeId[] = [startNodeId];
    const descendants = new Set<NodeId>();
    while (pendingNodeIds.length > 0) {
      const nodeId = pendingNodeIds.pop();
      if (!nodeId || descendants.has(nodeId)) {
        continue;
      }
      descendants.add(nodeId);
      for (const edge of this.topology.outgoingByNode.get(nodeId) ?? []) {
        pendingNodeIds.push(edge.to.nodeId);
      }
    }
    return [...descendants];
  }

  private collectRuntimeDescendants(
    currentState: RunCurrentState,
    descendantNodeIds: ReadonlyArray<NodeId>,
  ): ReadonlyArray<NodeId> {
    const descendantSet = new Set(descendantNodeIds);
    const runtimeNodeIds = new Set<NodeId>();
    for (const nodeId of [
      ...Object.keys(currentState.outputsByNode),
      ...Object.keys(currentState.nodeSnapshotsByNodeId),
      ...Object.keys(currentState.mutableState?.nodesById ?? {}),
    ] as NodeId[]) {
      if (!this.isRuntimeDescendant(nodeId, descendantSet)) {
        continue;
      }
      runtimeNodeIds.add(nodeId);
    }
    return [...runtimeNodeIds];
  }

  private isRuntimeDescendant(nodeId: NodeId, descendantNodeIds: ReadonlySet<NodeId>): boolean {
    for (const descendantNodeId of descendantNodeIds) {
      if (nodeId === descendantNodeId) {
        return false;
      }
      if (ConnectionNodeIdFactory.isConnectionOwnedDescendantOf(descendantNodeId, nodeId)) {
        return true;
      }
    }
    return false;
  }
}
