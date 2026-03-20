import type {
ExecutionFrontierPlan,
Items,
NodeId,
RunCurrentState,
RunQueueEntry,
RunStateResetRequest,
RunStopCondition
} from "../../types";




import { DependencySatisfactionResolver } from "./DependencySatisfactionResolver";
import { FrontierQueueBuilder } from "./FrontierQueueBuilder";
import { PinnedOutputResolver } from "./PinnedOutputResolver";
import { RequiredNodeCollector } from "./RequiredNodeCollector";
import { RootNodeInputResolver } from "./RootNodeInputResolver";
import { RunCurrentStateFactory } from "./RunCurrentStateFactory";
import { RunStateResetter } from "./RunStateResetter";
import { WorkflowTopology } from "./WorkflowTopologyPlanner";

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
        ...resetResult.preservedPinnedNodeIds.filter((nodeId) => requiredNodeIds.has(nodeId)),
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

export { DependencySatisfactionResolver } from "./DependencySatisfactionResolver";
export { FrontierQueueBuilder } from "./FrontierQueueBuilder";
export { PinnedOutputResolver } from "./PinnedOutputResolver";
export { RequiredNodeCollector } from "./RequiredNodeCollector";
export { RootNodeInputResolver } from "./RootNodeInputResolver";
export { RunCurrentStateFactory } from "./RunCurrentStateFactory";
export { RunStateResetter } from "./RunStateResetter";
