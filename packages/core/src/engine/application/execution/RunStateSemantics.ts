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
  RunStateStore,
  WorkflowDefinition,
  WorkflowId,
} from "../../../types";

import { createWorkflowExecutableNodeClassifier } from "../../../workflow/workflowExecutableNodeClassifier.types";
import { RunQueuePlanner } from "../../planning/runQueuePlanner";

import { MissingRuntimeExecutionMarker } from "../../adapters/persisted-workflow/MissingRuntimeExecutionMarkerFactory";
import { InputPortMap } from "../../domain/execution/InputPortMapFactory";
import { NodeSnapshotFactory } from "../../domain/execution/NodeSnapshotFactory";

export class RunStateSemantics {
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
    const lastNodeId = createWorkflowExecutableNodeClassifier(workflow).lastExecutableNodeIdInDefinitionOrder(workflow);
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
      snapshots[nodeId] = NodeSnapshotFactory.completed({
        previous,
        runId: args.runId,
        workflowId: args.workflowId,
        nodeId,
        activationId: previous?.activationId ?? `synthetic_${nodeId}`,
        parent: args.parent,
        finishedAt: args.finishedAt,
        inputsByPort: previous?.inputsByPort ?? InputPortMap.empty(),
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
    mutableState: NonNullable<Awaited<ReturnType<RunStateStore["load"]>>>["mutableState"];
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
        args.nodeSnapshotsByNodeId[queueEntry.nodeId] = NodeSnapshotFactory.completed({
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
    if (MissingRuntimeExecutionMarker.isMarked(definition?.config)) {
      return NodeSnapshotFactory.skipped(args);
    }
    return NodeSnapshotFactory.completed(args);
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
