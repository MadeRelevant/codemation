import type {
  BinaryStorage,
  ExecutionContext,
  ExecutionContextFactory,
  ExecutionTelemetryFactory,
  NodeExecutionStatePublisher,
  ParentExecutionRef,
  RunDataSnapshot,
  RunId,
  WorkflowId,
} from "../types";
import { NoOpExecutionTelemetryFactory } from "../types";

import {
  DefaultExecutionBinaryService,
  UnavailableBinaryStorage,
} from "../binaries/DefaultExecutionBinaryServiceFactory";

export class DefaultExecutionContextFactory implements ExecutionContextFactory {
  constructor(
    private readonly binaryStorage: BinaryStorage = new UnavailableBinaryStorage(),
    private readonly telemetryFactory: ExecutionTelemetryFactory = new NoOpExecutionTelemetryFactory(),
    private readonly currentDate: () => Date = () => new Date(),
  ) {}

  create(args: {
    runId: RunId;
    workflowId: WorkflowId;
    parent?: ParentExecutionRef;
    policySnapshot?: import("../types").PersistedRunPolicySnapshot;
    subworkflowDepth: number;
    engineMaxNodeActivations: number;
    engineMaxSubworkflowDepth: number;
    data: RunDataSnapshot;
    nodeState?: NodeExecutionStatePublisher;
    telemetry?: ExecutionContext["telemetry"];
    getCredential<TSession = unknown>(slotKey: string): Promise<TSession>;
  }): ExecutionContext {
    return {
      runId: args.runId,
      workflowId: args.workflowId,
      parent: args.parent,
      subworkflowDepth: args.subworkflowDepth,
      engineMaxNodeActivations: args.engineMaxNodeActivations,
      engineMaxSubworkflowDepth: args.engineMaxSubworkflowDepth,
      now: this.currentDate,
      data: args.data,
      nodeState: args.nodeState,
      telemetry:
        args.telemetry ??
        this.telemetryFactory.create({
          runId: args.runId,
          workflowId: args.workflowId,
          parent: args.parent,
          policySnapshot: args.policySnapshot,
        }),
      binary: new DefaultExecutionBinaryService(this.binaryStorage, args.workflowId, args.runId, this.currentDate),
      getCredential: args.getCredential,
    };
  }
}
