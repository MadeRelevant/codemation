import type {
  JsonValue,
  NodeActivationId,
  NodeExecutionSnapshot,
  NodeId,
  NodeInputsByPort,
  NodeOutputs,
  ParentExecutionRef,
  RunId,
  WorkflowId,
} from "../types";

export class NodeExecutionSnapshotFactory {
  static queued(args: {
    runId: RunId;
    workflowId: WorkflowId;
    nodeId: NodeId;
    activationId: NodeActivationId;
    parent?: ParentExecutionRef;
    queuedAt: string;
    inputsByPort: NodeInputsByPort;
  }): NodeExecutionSnapshot {
    return {
      runId: args.runId,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      parent: args.parent,
      status: "queued",
      queuedAt: args.queuedAt,
      updatedAt: args.queuedAt,
      inputsByPort: args.inputsByPort,
    };
  }

  static running(args: {
    previous?: NodeExecutionSnapshot;
    runId: RunId;
    workflowId: WorkflowId;
    nodeId: NodeId;
    activationId: NodeActivationId;
    parent?: ParentExecutionRef;
    startedAt: string;
    inputsByPort: NodeInputsByPort;
  }): NodeExecutionSnapshot {
    return {
      runId: args.runId,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      parent: args.parent,
      status: "running",
      queuedAt: args.previous?.queuedAt,
      startedAt: args.startedAt,
      updatedAt: args.startedAt,
      inputsByPort: args.inputsByPort,
      outputs: args.previous?.outputs,
      error: undefined,
    };
  }

  static completed(args: {
    previous?: NodeExecutionSnapshot;
    runId: RunId;
    workflowId: WorkflowId;
    nodeId: NodeId;
    activationId: NodeActivationId;
    parent?: ParentExecutionRef;
    finishedAt: string;
    inputsByPort: NodeInputsByPort;
    outputs: NodeOutputs;
    fromPinnedOutput?: boolean;
  }): NodeExecutionSnapshot {
    const fromPinnedOutput = args.fromPinnedOutput ?? false;
    const startedAt = fromPinnedOutput ? (args.previous?.startedAt ?? args.finishedAt) : args.previous?.startedAt;
    return {
      runId: args.runId,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      parent: args.parent,
      status: "completed",
      queuedAt: args.previous?.queuedAt,
      startedAt,
      finishedAt: args.finishedAt,
      updatedAt: args.finishedAt,
      inputsByPort: args.inputsByPort,
      outputs: args.outputs,
      usedPinnedOutput: fromPinnedOutput,
      error: undefined,
    };
  }

  static skipped(args: {
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
    return {
      runId: args.runId,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      parent: args.parent,
      status: "skipped",
      queuedAt: args.previous?.queuedAt,
      startedAt: args.previous?.startedAt,
      finishedAt: args.finishedAt,
      updatedAt: args.finishedAt,
      inputsByPort: args.inputsByPort,
      outputs: args.outputs,
      error: undefined,
    };
  }

  static failed(args: {
    previous?: NodeExecutionSnapshot;
    runId: RunId;
    workflowId: WorkflowId;
    nodeId: NodeId;
    activationId: NodeActivationId;
    parent?: ParentExecutionRef;
    finishedAt: string;
    inputsByPort: NodeInputsByPort;
    error: Error;
  }): NodeExecutionSnapshot {
    return {
      runId: args.runId,
      workflowId: args.workflowId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      parent: args.parent,
      status: "failed",
      queuedAt: args.previous?.queuedAt,
      startedAt: args.previous?.startedAt,
      finishedAt: args.finishedAt,
      updatedAt: args.finishedAt,
      inputsByPort: args.inputsByPort,
      outputs: undefined,
      error: {
        message: args.error.message,
        name: args.error.name,
        stack: args.error.stack,
        details: (args.error as Error & { details?: JsonValue }).details,
      },
    };
  }
}
