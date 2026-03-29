import type {
  ConnectionInvocationRecord,
  EngineRunCounters,
  NodeActivationRequest,
  NodeActivationScheduler,
  NodeExecutionSnapshot,
  NodeId,
  ParentExecutionRef,
  PendingNodeExecution,
  PersistedRunControlState,
  RunDataFactory,
  RunExecutionOptions,
  RunId,
  RunQueueEntry,
  RunResult,
  WorkflowExecutionRepository,
  WorkflowId,
} from "../types";

import { RunQueuePlanner } from "../planning/RunQueuePlanner";

import { NodeEventPublisher } from "../events/NodeEventPublisher";
import { NodeExecutionSnapshotFactory } from "./NodeExecutionSnapshotFactory";
import { NodeInputsByPortFactory } from "./NodeInputsByPortFactory";

type PersistedRunStateRecord = NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>;

type ActivationSchedulerPort = Pick<NodeActivationScheduler, "enqueue"> &
  Pick<Partial<NodeActivationScheduler>, "notifyPendingStatePersisted">;

export type ActivationEnqueueRequest = {
  runId: RunId;
  workflowId: WorkflowId;
  startedAt: string;
  parent?: ParentExecutionRef;
  executionOptions?: RunExecutionOptions;
  control: PersistedRunControlState | undefined;
  workflowSnapshot: PersistedRunStateRecord["workflowSnapshot"];
  mutableState: PersistedRunStateRecord["mutableState"];
  policySnapshot: PersistedRunStateRecord["policySnapshot"];
  pendingQueue: RunQueueEntry[];
  request: NodeActivationRequest;
  previousNodeSnapshotsByNodeId: Record<NodeId, NodeExecutionSnapshot>;
  planner: RunQueuePlanner;
  engineCounters?: EngineRunCounters;
  connectionInvocations?: ReadonlyArray<ConnectionInvocationRecord>;
};

export class ActivationEnqueueService {
  constructor(
    private readonly activationScheduler: ActivationSchedulerPort,
    private readonly workflowExecutionRepository: WorkflowExecutionRepository,
    private readonly nodeEventPublisher: NodeEventPublisher,
  ) {}

  async enqueueActivation(args: ActivationEnqueueRequest): Promise<RunResult> {
    const { result, queuedSnapshot } = await this.enqueueActivationWithSnapshot(args);
    await this.nodeEventPublisher.publish("nodeQueued", queuedSnapshot);
    return result;
  }

  async enqueueActivationWithSnapshot(
    args: ActivationEnqueueRequest,
  ): Promise<{ result: RunResult; queuedSnapshot: NodeExecutionSnapshot }> {
    const receipt = await this.activationScheduler.enqueue(args.request);
    const inputsByPort = NodeInputsByPortFactory.fromRequest(args.request);
    const itemsIn =
      args.request.kind === "multi"
        ? args.planner.sumItemsByPort(args.request.inputsByPort)
        : args.request.input.length;
    const enqueuedAt = new Date().toISOString();
    const pending: PendingNodeExecution = {
      runId: args.runId,
      activationId: args.request.activationId,
      workflowId: args.workflowId,
      nodeId: args.request.nodeId,
      itemsIn,
      inputsByPort,
      receiptId: receipt.receiptId,
      queue: receipt.queue,
      batchId: args.request.batchId,
      enqueuedAt,
    };
    const queuedSnapshot = NodeExecutionSnapshotFactory.queued({
      runId: args.runId,
      workflowId: args.workflowId,
      nodeId: args.request.nodeId,
      activationId: args.request.activationId,
      parent: args.parent,
      queuedAt: enqueuedAt,
      inputsByPort,
    });

    await this.workflowExecutionRepository.save({
      runId: args.runId,
      workflowId: args.workflowId,
      startedAt: args.startedAt,
      parent: args.parent,
      executionOptions: args.executionOptions,
      control: args.control,
      workflowSnapshot: args.workflowSnapshot,
      mutableState: args.mutableState,
      policySnapshot: args.policySnapshot,
      engineCounters: args.engineCounters,
      connectionInvocations: args.connectionInvocations ? [...args.connectionInvocations] : [],
      status: "pending",
      pending,
      queue: args.pendingQueue.map((entry) => ({ ...entry })),
      outputsByNode: (args.request.ctx.data as ReturnType<RunDataFactory["create"]>).dump(),
      nodeSnapshotsByNodeId: {
        ...args.previousNodeSnapshotsByNodeId,
        [args.request.nodeId]: queuedSnapshot,
      },
    });
    this.notifyPendingStatePersisted(args.runId);
    return {
      result: { runId: args.runId, workflowId: args.workflowId, startedAt: args.startedAt, status: "pending", pending },
      queuedSnapshot,
    };
  }

  private notifyPendingStatePersisted(runId: RunId): void {
    this.activationScheduler.notifyPendingStatePersisted?.(runId);
  }
}
