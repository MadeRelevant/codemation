import type {
  ExecutionFrontierPlan,
  InputPortKey,
  Items,
  NodeId,
  NodeOutputs,
  OutputPortKey,
  RunCurrentState,
  RunQueueEntry,
  RunStateResetRequest,
  RunStopCondition,
} from "../../types";
import { AgentAttachmentNodeIdFactory } from "../../ai";
import { WorkflowTopology } from "./workflowTopology";

class PinnedOutputResolver {
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

class RunCurrentStateFactory {
  static empty(): RunCurrentState {
    return {
      outputsByNode: {},
      nodeSnapshotsByNodeId: {},
      mutableState: undefined,
    };
  }

  static clone(currentState: RunCurrentState | undefined): RunCurrentState {
    if (!currentState) {
      return this.empty();
    }
    return {
      outputsByNode: { ...currentState.outputsByNode },
      nodeSnapshotsByNodeId: { ...currentState.nodeSnapshotsByNodeId },
      mutableState: currentState.mutableState,
    };
  }
}

class RunStateResetter {
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

    for (const nodeId of [...descendants, ...runtimeDescendants]) {
      if (this.pinnedOutputResolver.hasPinnedOutputs(nodeId)) {
        const pinnedOutputs = this.pinnedOutputResolver.getPinnedOutputs(nodeId);
        if (pinnedOutputs) {
          outputsByNode[nodeId] = pinnedOutputs;
        }
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
        mutableState: args.currentState.mutableState,
      },
      clearedNodeIds,
      preservedPinnedNodeIds,
    };
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

  private collectRuntimeDescendants(currentState: RunCurrentState, descendantNodeIds: ReadonlyArray<NodeId>): ReadonlyArray<NodeId> {
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
      if (nodeId.startsWith(`${descendantNodeId}::llm`) || nodeId.startsWith(`${descendantNodeId}::tool::`)) {
        return true;
      }
    }
    const parsedLanguageModelNodeId = AgentAttachmentNodeIdFactory.parseLanguageModelNodeId(nodeId);
    if (parsedLanguageModelNodeId && descendantNodeIds.has(parsedLanguageModelNodeId.parentNodeId)) {
      return true;
    }
    const parsedToolNodeId = AgentAttachmentNodeIdFactory.parseToolNodeId(nodeId);
    return Boolean(parsedToolNodeId && descendantNodeIds.has(parsedToolNodeId.parentNodeId));
  }
}

class DependencySatisfactionResolver {
  constructor(
    private readonly topology: WorkflowTopology,
    private readonly currentState: RunCurrentState,
  ) {}

  isNodeSatisfied(nodeId: NodeId): boolean {
    return this.hasOutputs(nodeId) || this.hasCompletedSnapshot(nodeId);
  }

  isEdgeSatisfied(args: { nodeId: NodeId; input: InputPortKey }): boolean {
    const incomingEdges = this.topology.incomingByNode.get(args.nodeId) ?? [];
    const incomingEdge = incomingEdges.find((edge) => edge.input === args.input);
    if (!incomingEdge) {
      return false;
    }
    return this.hasOutputPort(incomingEdge.from.nodeId, incomingEdge.from.output);
  }

  resolveInput(args: { nodeId: NodeId; input: InputPortKey }): Items {
    const incomingEdges = this.topology.incomingByNode.get(args.nodeId) ?? [];
    const incomingEdge = incomingEdges.find((edge) => edge.input === args.input);
    if (!incomingEdge) {
      return [];
    }
    return this.resolveOutputItems(incomingEdge.from.nodeId, incomingEdge.from.output);
  }

  private hasOutputs(nodeId: NodeId): boolean {
    return Object.prototype.hasOwnProperty.call(this.currentState.outputsByNode, nodeId);
  }

  private hasCompletedSnapshot(nodeId: NodeId): boolean {
    const snapshot = this.currentState.nodeSnapshotsByNodeId[nodeId];
    return snapshot?.status === "completed" || snapshot?.status === "skipped";
  }

  private hasOutputPort(nodeId: NodeId, output: OutputPortKey): boolean {
    const outputs = this.currentState.outputsByNode[nodeId];
    if (!outputs) {
      return false;
    }
    return Object.prototype.hasOwnProperty.call(outputs, output);
  }

  private resolveOutputItems(nodeId: NodeId, output: OutputPortKey): Items {
    const outputs = this.currentState.outputsByNode[nodeId];
    return outputs?.[output] ?? [];
  }
}

class RequiredNodeCollector {
  private readonly requiredNodeIds = new Set<NodeId>();

  constructor(
    private readonly topology: WorkflowTopology,
    private readonly satisfactionResolver: DependencySatisfactionResolver,
  ) {}

  collect(stopCondition: RunStopCondition): ReadonlySet<NodeId> {
    if (stopCondition.kind === "workflowCompleted") {
      for (const nodeId of this.topology.defsById.keys()) {
        if (!this.satisfactionResolver.isNodeSatisfied(nodeId)) {
          this.collectNode(nodeId);
        }
      }
      return this.requiredNodeIds;
    }

    if (!this.topology.defsById.has(stopCondition.nodeId)) {
      throw new Error(`Unknown stop nodeId: ${stopCondition.nodeId}`);
    }
    this.collectNode(stopCondition.nodeId);
    return this.requiredNodeIds;
  }

  private collectNode(nodeId: NodeId): void {
    if (this.requiredNodeIds.has(nodeId) || this.satisfactionResolver.isNodeSatisfied(nodeId)) {
      return;
    }
    this.requiredNodeIds.add(nodeId);
    for (const edge of this.topology.incomingByNode.get(nodeId) ?? []) {
      if (!this.satisfactionResolver.isEdgeSatisfied({ nodeId, input: edge.input })) {
        this.collectNode(edge.from.nodeId);
      }
    }
  }
}

class FrontierQueueBuilder {
  constructor(
    private readonly topology: WorkflowTopology,
    private readonly satisfactionResolver: DependencySatisfactionResolver,
  ) {}

  build(args: { nodeId: NodeId }): RunQueueEntry[] {
    const incomingEdges = this.topology.incomingByNode.get(args.nodeId) ?? [];
    if (incomingEdges.length === 0) {
      return [];
    }
    const expectedInputs = this.topology.expectedInputsByNode.get(args.nodeId) ?? [];
    const usesCollect = expectedInputs.length !== 1 || expectedInputs[0] !== "in";
    if (usesCollect) {
      const received: Record<InputPortKey, Items> = {};
      for (const input of expectedInputs) {
        received[input] = this.satisfactionResolver.resolveInput({ nodeId: args.nodeId, input });
      }
      return [
        {
          nodeId: args.nodeId,
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
    const incomingEdge = incomingEdges.find((edge) => edge.input === input);
    return [
      {
        nodeId: args.nodeId,
        input: this.satisfactionResolver.resolveInput({ nodeId: args.nodeId, input }),
        toInput: input,
        batchId: "batch_1",
        from: incomingEdge?.from,
      },
    ];
  }
}

class RootNodeInputResolver {
  resolve(args: { nodeKind: "node" | "trigger"; items?: Items }): Items {
    if (args.items) {
      return args.items;
    }
    if (args.nodeKind === "trigger") {
      return [];
    }
    return [{ json: {} }];
  }
}

export class CurrentStateFrontierPlanner {
  private readonly rootNodeInputResolver = new RootNodeInputResolver();

  constructor(private readonly topology: WorkflowTopology) {}

  plan(args: { currentState?: RunCurrentState; stopCondition?: RunStopCondition; reset?: RunStateResetRequest; items?: Items }): ExecutionFrontierPlan {
    const stopCondition = args.stopCondition ?? { kind: "workflowCompleted" as const };
    const baseState = RunCurrentStateFactory.clone(args.currentState);
    const pinnedOutputResolver = new PinnedOutputResolver(baseState);
    const normalizedState = pinnedOutputResolver.overlayPinnedOutputs();
    const resetter = new RunStateResetter(this.topology, new PinnedOutputResolver(normalizedState));
    const resetResult = resetter.apply({ currentState: normalizedState, reset: args.reset });
    const satisfactionResolver = new DependencySatisfactionResolver(this.topology, resetResult.currentState);
    const requiredNodeIds = new RequiredNodeCollector(this.topology, satisfactionResolver).collect(stopCondition);
    const satisfiedNodeIds = this.collectSatisfiedNodeIds(satisfactionResolver);
    const skippedNodeIds = [
      ...new Set([
        ...[...requiredNodeIds].filter((nodeId) => satisfactionResolver.isNodeSatisfied(nodeId)),
        ...resetResult.preservedPinnedNodeIds,
      ]),
    ];
    const frontierNodeIds = this.collectFrontierNodeIds(requiredNodeIds, satisfactionResolver);
    const rootNodeIds = frontierNodeIds.filter((nodeId) => (this.topology.incomingByNode.get(nodeId) ?? []).length === 0);

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
        rootNodeInput: this.rootNodeInputResolver.resolve({ nodeKind: definition.kind, items: args.items }),
        queue: [],
        currentState: resetResult.currentState,
        stopCondition,
        satisfiedNodeIds,
        skippedNodeIds,
        clearedNodeIds: resetResult.clearedNodeIds,
        preservedPinnedNodeIds: resetResult.preservedPinnedNodeIds,
      };
    }

    const queueBuilder = new FrontierQueueBuilder(this.topology, satisfactionResolver);
    const queue: RunQueueEntry[] = [];
    for (const nodeId of frontierNodeIds) {
      queue.push(...queueBuilder.build({ nodeId }));
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

  private collectSatisfiedNodeIds(satisfactionResolver: DependencySatisfactionResolver): ReadonlyArray<NodeId> {
    const satisfiedNodeIds: NodeId[] = [];
    for (const nodeId of this.topology.defsById.keys()) {
      if (satisfactionResolver.isNodeSatisfied(nodeId)) {
        satisfiedNodeIds.push(nodeId);
      }
    }
    return satisfiedNodeIds;
  }

  private collectFrontierNodeIds(
    requiredNodeIds: ReadonlySet<NodeId>,
    satisfactionResolver: DependencySatisfactionResolver,
  ): ReadonlyArray<NodeId> {
    const frontierNodeIds: NodeId[] = [];
    for (const nodeId of this.topology.defsById.keys()) {
      if (!requiredNodeIds.has(nodeId) || satisfactionResolver.isNodeSatisfied(nodeId)) {
        continue;
      }
      const incomingEdges = this.topology.incomingByNode.get(nodeId) ?? [];
      const isFrontier = incomingEdges.every((edge) => satisfactionResolver.isEdgeSatisfied({ nodeId, input: edge.input }));
      if (isFrontier) {
        frontierNodeIds.push(nodeId);
      }
    }
    return frontierNodeIds;
  }
}
