import type {
  ExecutionFrontierPlan,
  InputPortKey,
  Items,
  NodeId,
  NodeOutputs,
  OutputPortKey,
  RunCurrentState,
  PersistedMutableNodeState,
  RunQueueEntry,
  RunStateResetRequest,
  RunStopCondition,
  ConnectionInvocationRecord,
} from "../types";

import { ConnectionNodeIdFactory } from "../workflow/definition/ConnectionNodeIdFactory";
import { WorkflowTopology } from "./WorkflowTopologyPlanner";

export class CurrentStateFrontierPlanner {
  constructor(private readonly topology: WorkflowTopology) {}

  /** Composition-root-friendly factory (avoids `new` at orchestration call sites under ESLint manual-DI rules). */
  static createFromTopology(topology: WorkflowTopology): CurrentStateFrontierPlanner {
    return new CurrentStateFrontierPlanner(topology);
  }

  plan(args: {
    currentState?: RunCurrentState;
    stopCondition?: RunStopCondition;
    reset?: RunStateResetRequest;
    items?: Items;
  }): ExecutionFrontierPlan {
    const stopCondition = args.stopCondition ?? { kind: "workflowCompleted" as const };
    const baseState = this.cloneCurrentState(args.currentState);
    const normalizedState = this.overlayPinnedOutputs(baseState);
    const resetResult = this.applyReset({ currentState: normalizedState, reset: args.reset });
    const requiredNodeIds = this.collectRequiredNodeIds(stopCondition, resetResult.currentState);
    const satisfiedNodeIds = this.collectSatisfiedNodeIds(resetResult.currentState);
    const skippedNodeIds = [
      ...new Set([
        ...[...requiredNodeIds].filter((nodeId) => this.isNodeSatisfied(resetResult.currentState, nodeId)),
        ...resetResult.preservedPinnedNodeIds.filter((nodeId) => requiredNodeIds.has(nodeId)),
      ]),
    ];
    const frontierNodeIds = this.collectFrontierNodeIds(requiredNodeIds, resetResult.currentState);
    const rootNodeIds = frontierNodeIds.filter(
      (nodeId) => (this.topology.incomingByNode.get(nodeId) ?? []).length === 0,
    );

    if (rootNodeIds.length > 1) {
      throw new Error(`Ambiguous execution frontier. Multiple root nodes require input: ${rootNodeIds.join(", ")}`);
    }

    if (frontierNodeIds.length === 0) {
      return {
        queue: [],
        currentState: resetResult.currentState,
        stopCondition,
        satisfiedNodeIds,
        skippedNodeIds,
        clearedNodeIds: resetResult.clearedNodeIds,
        preservedPinnedNodeIds: resetResult.preservedPinnedNodeIds,
      };
    }

    if (rootNodeIds.length === 1) {
      const rootNodeId = rootNodeIds[0]!;
      const definition = this.topology.defsById.get(rootNodeId);
      if (!definition) {
        throw new Error(`Unknown frontier nodeId: ${rootNodeId}`);
      }
      return {
        rootNodeId,
        rootNodeInput: this.resolveRootNodeInput({ nodeKind: definition.kind, items: args.items }),
        queue: [],
        currentState: resetResult.currentState,
        stopCondition,
        satisfiedNodeIds,
        skippedNodeIds,
        clearedNodeIds: resetResult.clearedNodeIds,
        preservedPinnedNodeIds: resetResult.preservedPinnedNodeIds,
      };
    }

    const queue: RunQueueEntry[] = [];
    for (const nodeId of frontierNodeIds) {
      queue.push(...this.buildFrontierQueue(nodeId, resetResult.currentState));
    }

    return {
      queue,
      currentState: resetResult.currentState,
      stopCondition,
      satisfiedNodeIds,
      skippedNodeIds,
      clearedNodeIds: resetResult.clearedNodeIds,
      preservedPinnedNodeIds: resetResult.preservedPinnedNodeIds,
    };
  }

  private cloneCurrentState(currentState: RunCurrentState | undefined): RunCurrentState {
    if (!currentState) {
      return {
        outputsByNode: {},
        nodeSnapshotsByNodeId: {},
        connectionInvocations: [],
        mutableState: undefined,
      };
    }
    return {
      outputsByNode: { ...currentState.outputsByNode },
      nodeSnapshotsByNodeId: { ...currentState.nodeSnapshotsByNodeId },
      connectionInvocations: currentState.connectionInvocations ? [...currentState.connectionInvocations] : undefined,
      mutableState: currentState.mutableState,
    };
  }

  private overlayPinnedOutputs(currentState: RunCurrentState): RunCurrentState {
    const outputsByNode: Record<NodeId, NodeOutputs> = { ...currentState.outputsByNode };
    for (const [nodeId, nodeState] of Object.entries(currentState.mutableState?.nodesById ?? {}) as Array<
      [NodeId, PersistedMutableNodeState]
    >) {
      const pinnedOutputs = nodeState.pinnedOutputsByPort;
      if (!pinnedOutputs) {
        continue;
      }
      outputsByNode[nodeId] = pinnedOutputs;
    }
    return {
      outputsByNode,
      nodeSnapshotsByNodeId: { ...currentState.nodeSnapshotsByNodeId },
      connectionInvocations: currentState.connectionInvocations,
      mutableState: currentState.mutableState,
    };
  }

  private applyReset(args: { currentState: RunCurrentState; reset?: RunStateResetRequest }): Readonly<{
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
      const pinnedOutputs = this.getPinnedOutputs(args.currentState, nodeId);
      if (pinnedOutputs) {
        outputsByNode[nodeId] = pinnedOutputs;
        delete nodeSnapshotsByNodeId[nodeId];
        preservedPinnedNodeIds.push(nodeId);
        continue;
      }
      delete outputsByNode[nodeId];
      delete nodeSnapshotsByNodeId[nodeId];
      clearedNodeIds.push(nodeId);
    }

    return {
      currentState: {
        outputsByNode,
        nodeSnapshotsByNodeId,
        connectionInvocations: this.filterConnectionInvocations(args.currentState.connectionInvocations, clearedIdSet),
        mutableState: args.currentState.mutableState,
      },
      clearedNodeIds,
      preservedPinnedNodeIds,
    };
  }

  private collectSatisfiedNodeIds(currentState: RunCurrentState): ReadonlyArray<NodeId> {
    const satisfiedNodeIds: NodeId[] = [];
    for (const nodeId of this.topology.defsById.keys()) {
      if (this.isNodeSatisfied(currentState, nodeId)) {
        satisfiedNodeIds.push(nodeId);
      }
    }
    return satisfiedNodeIds;
  }

  private collectFrontierNodeIds(
    requiredNodeIds: ReadonlySet<NodeId>,
    currentState: RunCurrentState,
  ): ReadonlyArray<NodeId> {
    const frontierNodeIds: NodeId[] = [];
    for (const nodeId of this.topology.defsById.keys()) {
      if (!requiredNodeIds.has(nodeId) || this.isNodeSatisfied(currentState, nodeId)) {
        continue;
      }
      const incomingEdges = this.topology.incomingByNode.get(nodeId) ?? [];
      const isFrontier = incomingEdges.every((edge) => this.isEdgeSatisfied(currentState, nodeId, edge.collectKey));
      if (isFrontier) {
        frontierNodeIds.push(nodeId);
      }
    }
    return frontierNodeIds;
  }

  private collectRequiredNodeIds(stopCondition: RunStopCondition, currentState: RunCurrentState): ReadonlySet<NodeId> {
    const requiredNodeIds = new Set<NodeId>();
    if (stopCondition.kind === "workflowCompleted") {
      for (const nodeId of this.topology.defsById.keys()) {
        if (!this.isNodeSatisfied(currentState, nodeId)) {
          this.collectRequiredNode(requiredNodeIds, currentState, nodeId);
        }
      }
      return requiredNodeIds;
    }
    if (!this.topology.defsById.has(stopCondition.nodeId)) {
      throw new Error(`Unknown stop nodeId: ${stopCondition.nodeId}`);
    }
    this.collectRequiredNode(requiredNodeIds, currentState, stopCondition.nodeId);
    return requiredNodeIds;
  }

  private collectRequiredNode(requiredNodeIds: Set<NodeId>, currentState: RunCurrentState, nodeId: NodeId): void {
    if (requiredNodeIds.has(nodeId)) {
      return;
    }
    if (this.isNodeSatisfied(currentState, nodeId) && !this.isNodeSatisfiedByOutputsOnly(currentState, nodeId)) {
      return;
    }
    requiredNodeIds.add(nodeId);
    for (const edge of this.topology.incomingByNode.get(nodeId) ?? []) {
      if (
        !this.isEdgeSatisfied(currentState, nodeId, edge.collectKey) ||
        this.isNodeSatisfiedByOutputsOnly(currentState, edge.from.nodeId)
      ) {
        this.collectRequiredNode(requiredNodeIds, currentState, edge.from.nodeId);
      }
    }
  }

  private buildFrontierQueue(nodeId: NodeId, currentState: RunCurrentState): ReadonlyArray<RunQueueEntry> {
    const incomingEdges = this.topology.incomingByNode.get(nodeId) ?? [];
    if (incomingEdges.length === 0) {
      return [];
    }
    const expectedInputs = this.topology.expectedInputsByNode.get(nodeId) ?? [];
    const usesCollect = this.usesCollect(nodeId);
    if (usesCollect) {
      const received: Record<InputPortKey, Items> = {};
      for (const input of expectedInputs) {
        received[input] = this.resolveInput(currentState, nodeId, input);
      }
      return [
        {
          nodeId,
          input: [],
          batchId: "batch_1",
          collect: {
            expectedInputs,
            received,
          },
        },
      ];
    }
    const input = expectedInputs[0] ?? "in";
    const incomingEdge = incomingEdges.find((edge) => edge.collectKey === input);
    return [
      {
        nodeId,
        input: this.resolveInput(currentState, nodeId, input),
        toInput: input,
        batchId: "batch_1",
        from: incomingEdge?.from,
      },
    ];
  }

  private resolveRootNodeInput(args: { nodeKind: "node" | "trigger"; items?: Items }): Items {
    if (args.items) {
      return args.items;
    }
    if (args.nodeKind === "trigger") {
      return [];
    }
    return [{ json: {} }];
  }

  private isNodeSatisfied(currentState: RunCurrentState, nodeId: NodeId): boolean {
    return this.hasOutputs(currentState, nodeId) || this.hasCompletedSnapshot(currentState, nodeId);
  }

  private isNodeSatisfiedByOutputsOnly(currentState: RunCurrentState, nodeId: NodeId): boolean {
    return this.hasOutputs(currentState, nodeId) && !this.hasCompletedSnapshot(currentState, nodeId);
  }

  private isEdgeSatisfied(currentState: RunCurrentState, nodeId: NodeId, collectKey: InputPortKey): boolean {
    const incomingEdge = (this.topology.incomingByNode.get(nodeId) ?? []).find(
      (edge) => edge.collectKey === collectKey,
    );
    if (!incomingEdge) {
      return false;
    }
    const fromNodeId = incomingEdge.from.nodeId;
    if (!this.isNodeSatisfied(currentState, fromNodeId)) {
      return false;
    }
    if (this.usesCollect(nodeId)) {
      return true;
    }
    const items = this.resolveOutputItems(currentState, fromNodeId, incomingEdge.from.output);
    if (items.length > 0) {
      return true;
    }
    return this.shouldContinueAfterEmptyOutputFromSource(fromNodeId);
  }

  private resolveInput(currentState: RunCurrentState, nodeId: NodeId, collectKey: InputPortKey): Items {
    const incomingEdge = (this.topology.incomingByNode.get(nodeId) ?? []).find(
      (edge) => edge.collectKey === collectKey,
    );
    if (!incomingEdge) {
      return [];
    }
    return this.resolveOutputItems(currentState, incomingEdge.from.nodeId, incomingEdge.from.output);
  }

  private hasOutputs(currentState: RunCurrentState, nodeId: NodeId): boolean {
    return Object.prototype.hasOwnProperty.call(currentState.outputsByNode, nodeId);
  }

  private hasCompletedSnapshot(currentState: RunCurrentState, nodeId: NodeId): boolean {
    const snapshot = currentState.nodeSnapshotsByNodeId[nodeId];
    return snapshot?.status === "completed" || snapshot?.status === "skipped";
  }

  private resolveOutputItems(currentState: RunCurrentState, nodeId: NodeId, output: OutputPortKey): Items {
    return currentState.outputsByNode[nodeId]?.[output] ?? [];
  }

  private usesCollect(nodeId: NodeId): boolean {
    const expectedInputs = this.topology.expectedInputsByNode.get(nodeId) ?? [];
    if (expectedInputs.length !== 1 || expectedInputs[0] !== "in") {
      return true;
    }
    return (this.topology.incomingByNode.get(nodeId) ?? []).length > 1;
  }

  private shouldContinueAfterEmptyOutputFromSource(nodeId: NodeId): boolean {
    const definition = this.topology.defsById.get(nodeId);
    if (!definition) {
      return false;
    }
    return definition.config.continueWhenEmptyOutput === true;
  }

  private getPinnedOutputs(currentState: RunCurrentState, nodeId: NodeId): NodeOutputs | undefined {
    return currentState.mutableState?.nodesById?.[nodeId]?.pinnedOutputsByPort;
  }

  private filterConnectionInvocations(
    invocations: ReadonlyArray<ConnectionInvocationRecord> | undefined,
    clearedIdSet: ReadonlySet<NodeId>,
  ): ReadonlyArray<ConnectionInvocationRecord> | undefined {
    if (!invocations || invocations.length === 0) {
      return invocations;
    }
    const kept = invocations.filter(
      (invocation) => !clearedIdSet.has(invocation.parentAgentNodeId) && !clearedIdSet.has(invocation.connectionNodeId),
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
      if (this.isRuntimeDescendant(nodeId, descendantSet)) {
        runtimeNodeIds.add(nodeId);
      }
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
