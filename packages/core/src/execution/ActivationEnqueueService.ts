import type {
  ConnectionInvocationRecord,
  EngineRunCounters,
  PendingResumeEntry,
  PersistedSuspensionEntry,
  PreparedNodeActivationDispatch,
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
import type { NodeActivationRequestInputPreparer } from "./NodeActivationRequestInputPreparer";
import { NodeExecutionSnapshotFactory } from "./NodeExecutionSnapshotFactory";
import { NodeInputsByPortFactory } from "./NodeInputsByPortFactory";

type PersistedRunStateRecord = NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>;

type ActivationSchedulerPort = Pick<NodeActivationScheduler, "prepareDispatch">;

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
  /**
   * Remaining suspension entries after consuming one for a HITL resume (story 01).
   * When provided, saved alongside the new pending state so they survive the enqueue.
   */
  suspension?: ReadonlyArray<PersistedSuspensionEntry>;
  /**
   * Resume context to attach to the re-activated node's execution context (story 01).
   * Written here and consumed by `NodeExecutionRequestHandlerService` when building ctx.
   */
  pendingResume?: PendingResumeEntry;
};

export class ActivationEnqueueService {
  constructor(
    private readonly activationScheduler: ActivationSchedulerPort,
    private readonly workflowExecutionRepository: WorkflowExecutionRepository,
    private readonly nodeEventPublisher: NodeEventPublisher,
    private readonly nodeActivationRequestInputPreparer: NodeActivationRequestInputPreparer,
  ) {}

  async enqueueActivation(args: ActivationEnqueueRequest): Promise<RunResult> {
    const { result, queuedSnapshot } = await this.enqueueActivationWithSnapshot(args);
    await this.nodeEventPublisher.publish("nodeQueued", queuedSnapshot);
    return result;
  }

  async enqueueActivationWithSnapshot(
    args: ActivationEnqueueRequest,
  ): Promise<{ result: RunResult; queuedSnapshot: NodeExecutionSnapshot }> {
    const preparedRequest = await this.nodeActivationRequestInputPreparer.prepare(args.request);
    const preparedDispatch = await this.activationScheduler.prepareDispatch(preparedRequest);
    const inputsByPort = NodeInputsByPortFactory.fromRequest(preparedRequest);
    const itemsIn =
      preparedRequest.kind === "multi"
        ? args.planner.sumItemsByPort(preparedRequest.inputsByPort)
        : preparedRequest.input.length;
    const enqueuedAt = new Date().toISOString();
    const pending: PendingNodeExecution = {
      runId: args.runId,
      activationId: args.request.activationId,
      workflowId: args.workflowId,
      nodeId: args.request.nodeId,
      itemsIn,
      inputsByPort,
      receiptId: preparedDispatch.receipt.receiptId,
      queue: preparedDispatch.receipt.queue,
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
      // HITL story 01: preserve suspension entries and resume context when re-activating a
      // suspended node. Omit fields when not provided (avoids polluting normal enqueue).
      ...(args.suspension !== undefined ? { suspension: args.suspension } : {}),
      ...(args.pendingResume !== undefined ? { pendingResume: args.pendingResume } : {}),
    });
    await this.dispatchPreparedActivation(preparedDispatch);
    return {
      result: { runId: args.runId, workflowId: args.workflowId, startedAt: args.startedAt, status: "pending", pending },
      queuedSnapshot,
    };
  }

  private async dispatchPreparedActivation(preparedDispatch: PreparedNodeActivationDispatch): Promise<void> {
    await preparedDispatch.dispatch();
  }
}
