import type {
  ConnectionInvocationAppendArgs,
  ConnectionInvocationRecord,
  NodeActivationId,
  NodeExecutionSnapshot,
  NodeExecutionStatePublisher,
  NodeId,
  NodeInputsByPort,
  NodeOutputs,
  ParentExecutionRef,
  RunId,
  WorkflowExecutionRepository,
  WorkflowId,
} from "../types";

import { NodeInputsByPortFactory } from "./NodeInputsByPortFactory";
import { NodeExecutionSnapshotFactory } from "./NodeExecutionSnapshotFactory";

export class NodeRunStateWriter implements NodeExecutionStatePublisher {
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly workflowExecutionRepository: WorkflowExecutionRepository,
    private readonly runId: RunId,
    private readonly workflowId: WorkflowId,
    private readonly parent: ParentExecutionRef | undefined,
    private readonly publishNodeEvent: (
      kind: "nodeQueued" | "nodeStarted" | "nodeCompleted" | "nodeFailed",
      snapshot: NodeExecutionSnapshot,
    ) => Promise<void>,
  ) {}

  markQueued(args: {
    nodeId: NodeId;
    activationId?: NodeActivationId;
    inputsByPort?: NodeInputsByPort;
  }): Promise<void> {
    return this.enqueue(async () => {
      const state = await this.loadState();
      const previous = state.nodeSnapshotsByNodeId?.[args.nodeId];
      const queuedAt = new Date().toISOString();
      const snapshot = NodeExecutionSnapshotFactory.queued({
        runId: this.runId,
        workflowId: this.workflowId,
        nodeId: args.nodeId,
        activationId: args.activationId ?? previous?.activationId ?? `synthetic_${args.nodeId}`,
        parent: this.parent,
        queuedAt,
        inputsByPort: args.inputsByPort ?? previous?.inputsByPort ?? NodeInputsByPortFactory.empty(),
      });
      await this.saveSnapshot(state, snapshot);
      await this.publishNodeEvent("nodeQueued", snapshot);
    });
  }

  markRunning(args: {
    nodeId: NodeId;
    activationId?: NodeActivationId;
    inputsByPort?: NodeInputsByPort;
  }): Promise<void> {
    return this.enqueue(async () => {
      const state = await this.loadState();
      const previous = state.nodeSnapshotsByNodeId?.[args.nodeId];
      const startedAt = new Date().toISOString();
      const snapshot = NodeExecutionSnapshotFactory.running({
        previous,
        runId: this.runId,
        workflowId: this.workflowId,
        nodeId: args.nodeId,
        activationId: args.activationId ?? previous?.activationId ?? `synthetic_${args.nodeId}`,
        parent: this.parent,
        startedAt,
        inputsByPort: args.inputsByPort ?? previous?.inputsByPort ?? NodeInputsByPortFactory.empty(),
      });
      await this.saveSnapshot(state, snapshot);
      await this.publishNodeEvent("nodeStarted", snapshot);
    });
  }

  markCompleted(args: {
    nodeId: NodeId;
    activationId?: NodeActivationId;
    inputsByPort?: NodeInputsByPort;
    outputs?: NodeOutputs;
  }): Promise<void> {
    return this.enqueue(async () => {
      const state = await this.loadState();
      const previous = state.nodeSnapshotsByNodeId?.[args.nodeId];
      const finishedAt = new Date().toISOString();
      const snapshot = NodeExecutionSnapshotFactory.completed({
        previous,
        runId: this.runId,
        workflowId: this.workflowId,
        nodeId: args.nodeId,
        activationId: args.activationId ?? previous?.activationId ?? `synthetic_${args.nodeId}`,
        parent: this.parent,
        finishedAt,
        inputsByPort: args.inputsByPort ?? previous?.inputsByPort ?? NodeInputsByPortFactory.empty(),
        outputs: args.outputs ?? previous?.outputs ?? {},
      });
      await this.saveSnapshot(state, snapshot);
      await this.publishNodeEvent("nodeCompleted", snapshot);
    });
  }

  markFailed(args: {
    nodeId: NodeId;
    activationId?: NodeActivationId;
    inputsByPort?: NodeInputsByPort;
    error: Error;
  }): Promise<void> {
    return this.enqueue(async () => {
      const state = await this.loadState();
      const previous = state.nodeSnapshotsByNodeId?.[args.nodeId];
      const finishedAt = new Date().toISOString();
      const snapshot = NodeExecutionSnapshotFactory.failed({
        previous,
        runId: this.runId,
        workflowId: this.workflowId,
        nodeId: args.nodeId,
        activationId: args.activationId ?? previous?.activationId ?? `synthetic_${args.nodeId}`,
        parent: this.parent,
        finishedAt,
        inputsByPort: args.inputsByPort ?? previous?.inputsByPort ?? NodeInputsByPortFactory.empty(),
        error: args.error,
      });
      await this.saveSnapshot(state, snapshot);
      await this.publishNodeEvent("nodeFailed", snapshot);
    });
  }

  appendConnectionInvocation(args: ConnectionInvocationAppendArgs): Promise<void> {
    return this.enqueue(async () => {
      const state = await this.loadState();
      const updatedAt = new Date().toISOString();
      const record: ConnectionInvocationRecord = {
        invocationId: args.invocationId,
        runId: this.runId,
        workflowId: this.workflowId,
        connectionNodeId: args.connectionNodeId,
        parentAgentNodeId: args.parentAgentNodeId,
        parentAgentActivationId: args.parentAgentActivationId,
        status: args.status,
        managedInput: args.managedInput,
        managedOutput: args.managedOutput,
        error: args.error,
        queuedAt: args.queuedAt,
        startedAt: args.startedAt,
        finishedAt: args.finishedAt,
        updatedAt,
      };
      await this.workflowExecutionRepository.save({
        ...state,
        connectionInvocations: [...(state.connectionInvocations ?? []), record],
      });
    });
  }

  private enqueue(work: () => Promise<void>): Promise<void> {
    const next = this.chain.then(work);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private async loadState(): Promise<NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>> {
    const state = await this.workflowExecutionRepository.load(this.runId);
    if (!state) {
      throw new Error(`Unknown runId: ${this.runId}`);
    }
    return state;
  }

  private async saveSnapshot(
    state: NonNullable<Awaited<ReturnType<WorkflowExecutionRepository["load"]>>>,
    snapshot: NodeExecutionSnapshot,
  ): Promise<void> {
    await this.workflowExecutionRepository.save({
      ...state,
      nodeSnapshotsByNodeId: {
        ...(state.nodeSnapshotsByNodeId ?? {}),
        [snapshot.nodeId]: snapshot,
      },
    });
  }
}
