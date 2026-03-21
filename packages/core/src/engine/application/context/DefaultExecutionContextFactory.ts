import type {
  BinaryStorage,
  ExecutionContext,
  ExecutionContextFactory,
  NodeExecutionStatePublisher,
  ParentExecutionRef,
  RunDataSnapshot,
  RunId,
  WorkflowId,
} from "../../../types";

import { DefaultExecutionBinaryService, UnavailableBinaryStorage } from "../binaries/DefaultExecutionBinaryServiceFactory";

export class DefaultExecutionContextFactory implements ExecutionContextFactory {
  constructor(
    private readonly binaryStorage: BinaryStorage = new UnavailableBinaryStorage(),
    private readonly currentDate: () => Date = () => new Date(),
  ) {}

  create(args: {
    runId: RunId;
    workflowId: WorkflowId;
    parent?: ParentExecutionRef;
    data: RunDataSnapshot;
    nodeState?: NodeExecutionStatePublisher;
    getCredential<TSession = unknown>(slotKey: string): Promise<TSession>;
  }): ExecutionContext {
    return {
      runId: args.runId,
      workflowId: args.workflowId,
      parent: args.parent,
      now: this.currentDate,
      data: args.data,
      nodeState: args.nodeState,
      binary: new DefaultExecutionBinaryService(this.binaryStorage, args.workflowId, args.runId, this.currentDate),
      getCredential: args.getCredential,
    };
  }
}

