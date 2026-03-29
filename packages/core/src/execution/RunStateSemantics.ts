import type {
  Items,
  NodeActivationId,
  NodeExecutionSnapshot,
  NodeId,
  NodeInputsByPort,
  NodeOutputs,
  ParentExecutionRef,
  PersistedRunControlState,
  RunCurrentState,
  RunDataFactory,
  RunId,
  RunQueueEntry,
  WorkflowExecutionRepository,
  WorkflowDefinition,
  WorkflowId,
} from "../types";

import { WorkflowExecutableNodeClassifierFactory } from "../workflow/definition/WorkflowExecutableNodeClassifierFactory";
import { RunQueuePlanner } from "../planning/RunQueuePlanner";

import { MissingRuntimeExecutionMarker } from "../workflowSnapshots/MissingRuntimeExecutionMarker";
import { NodeExecutionSnapshotFactory } from "./NodeExecutionSnapshotFactory";
import { NodeInputsByPortFactory } from "./NodeInputsByPortFactory";

export class RunStateSemantics {
  constructor(private readonly missingRuntimeExecutionMarker: MissingRuntimeExecutionMarker) {}

  isStopConditionSatisfied(stopCondition: PersistedRunControlState["stopCondition"], nodeId: NodeId): boolean {
    if (!stopCondition || stopCondition.kind === "workflowCompleted") {
      return false;
    }
    return stopCondition.nodeId === nodeId;
  }

  resolveResultOutputs(
    workflow: WorkflowDefinition,
    stopCondition: PersistedRunControlState["stopCondition"],
    outputsByNode: Record<NodeId, NodeOutputs>,
  ): Items {
    if (stopCondition?.kind === "nodeCompleted") {
      return outputsByNode[stopCondition.nodeId]?.main ?? [];
    }
    const lastNodeId =
      WorkflowExecutableNodeClassifierFactory.create(workflow).lastExecutableNodeIdInDefinitionOrder(workflow);
    return outputsByNode[lastNodeId]?.main ?? [];
  }

  applySkippedSnapshots(args: {
    runId: RunId;
    workflowId: WorkflowId;
    parent?: ParentExecutionRef;
    currentState: RunCurrentState;
    skippedNodeIds: ReadonlyArray<NodeId>;
    preservedPinnedNodeIds: ReadonlyArray<NodeId>;
    finishedAt: string;
  }): Record<NodeId, NodeExecutionSnapshot> {
    const snapshots = { ...args.currentState.nodeSnapshotsByNodeId };
    const skippedPinnedNodeIds = new Set<NodeId>(
      args.preservedPinnedNodeIds.filter((nodeId) => args.skippedNodeIds.includes(nodeId)),
    );
    for (const nodeId of args.skippedNodeIds) {
      if (args.currentState.mutableState?.nodesById?.[nodeId]?.pinnedOutputsByPort) {
        skippedPinnedNodeIds.add(nodeId);
      }
    }
    for (const nodeId of skippedPinnedNodeIds) {
      const previous = snapshots[nodeId];
      snapshots[nodeId] = NodeExecutionSnapshotFactory.completed({
        previous,
        runId: args.runId,
        workflowId: args.workflowId,
        nodeId,
        activationId: previous?.activationId ?? `synthetic_${nodeId}`,
        parent: args.parent,
        finishedAt: args.finishedAt,
        inputsByPort: previous?.inputsByPort ?? NodeInputsByPortFactory.empty(),
        outputs: args.currentState.outputsByNode[nodeId] ?? {},
        fromPinnedOutput: true,
      });
    }
    return snapshots;
  }

  applyPinnedQueueSkips(args: {
    runId: RunId;
    workflowId: WorkflowId;
    parent?: ParentExecutionRef;
    mutableState: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>["mutableState"];
    planner: RunQueuePlanner;
    queue: RunQueueEntry[];
    data: ReturnType<RunDataFactory["create"]>;
    nodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot>;
    finishedAt: string;
  }): void {
    let changed = true;
    while (changed) {
      changed = false;
      for (let index = 0; index < args.queue.length; index += 1) {
        const queueEntry = args.queue[index]!;
        const pinnedOutputs = args.mutableState?.nodesById?.[queueEntry.nodeId]?.pinnedOutputsByPort;
        if (!pinnedOutputs) {
          continue;
        }
        args.queue.splice(index, 1);
        const previous = args.nodeSnapshotsByNodeId[queueEntry.nodeId];
        args.nodeSnapshotsByNodeId[queueEntry.nodeId] = NodeExecutionSnapshotFactory.completed({
          previous,
          runId: args.runId,
          workflowId: args.workflowId,
          nodeId: queueEntry.nodeId,
          activationId: previous?.activationId ?? `synthetic_${queueEntry.nodeId}`,
          parent: args.parent,
          finishedAt: args.finishedAt,
          inputsByPort: this.resolveQueueEntryInputsByPort(queueEntry),
          outputs: pinnedOutputs,
          fromPinnedOutput: true,
        });
        args.data.setOutputs(queueEntry.nodeId, pinnedOutputs);
        args.planner.applyOutputs(args.queue, {
          fromNodeId: queueEntry.nodeId,
          outputs: pinnedOutputs as any,
          batchId: queueEntry.batchId ?? "batch_1",
        });
        changed = true;
        break;
      }
    }
  }

  createFinishedSnapshot(args: {
    workflow: WorkflowDefinition;
    previous?: NodeExecutionSnapshot;
    runId: RunId;
    workflowId: WorkflowId;
    nodeId: NodeId;
    activationId: NodeActivationId;
    parent?: ParentExecutionRef;
    finishedAt: string;
    inputsByPort: NodeInputsByPort;
    outputs: NodeOutputs;
  }): NodeExecutionSnapshot {
    const definition = args.workflow.nodes.find((node) => node.id === args.nodeId);
    if (this.missingRuntimeExecutionMarker.isMarked(definition?.config)) {
      return NodeExecutionSnapshotFactory.skipped(args);
    }
    return NodeExecutionSnapshotFactory.completed(args);
  }

  private resolveQueueEntryInputsByPort(queueEntry: RunQueueEntry): NodeInputsByPort {
    if (queueEntry.collect) {
      return queueEntry.collect.received;
    }
    return {
      [queueEntry.toInput ?? "in"]: queueEntry.input,
    };
  }
}
