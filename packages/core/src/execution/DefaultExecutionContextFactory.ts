import type {
  BinaryStorage,
  CostTrackingTelemetryFactory,
  ExecutionContext,
  ExecutionContextFactory,
  ExecutionTelemetryFactory,
  NodeExecutionStatePublisher,
  ParentExecutionRef,
  RunDataSnapshot,
  RunId,
  WorkflowId,
} from "../types";
import { NoOpCostTrackingTelemetryFactory, NoOpExecutionTelemetryFactory } from "../types";

import {
  DefaultExecutionBinaryService,
  UnavailableBinaryStorage,
} from "../binaries/DefaultExecutionBinaryServiceFactory";
import { ExecutionTelemetryCostTrackingDecoratorFactory } from "./ExecutionTelemetryCostTrackingDecoratorFactory";

export class DefaultExecutionContextFactory implements ExecutionContextFactory {
  private readonly telemetryDecoratorFactory = new ExecutionTelemetryCostTrackingDecoratorFactory();

  constructor(
    private readonly binaryStorage: BinaryStorage = new UnavailableBinaryStorage(),
    private readonly telemetryFactory: ExecutionTelemetryFactory = new NoOpExecutionTelemetryFactory(),
    private readonly costTrackingFactory: CostTrackingTelemetryFactory = new NoOpCostTrackingTelemetryFactory(),
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
    const baseTelemetry =
      args.telemetry ??
      this.telemetryFactory.create({
        runId: args.runId,
        workflowId: args.workflowId,
        parent: args.parent,
        policySnapshot: args.policySnapshot,
      });
    const telemetry = this.telemetryDecoratorFactory.decorateExecutionTelemetry({
      telemetry: baseTelemetry,
      costTracking: baseTelemetry.costTracking ?? this.costTrackingFactory.create({ telemetry: baseTelemetry }),
    });
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
      telemetry,
      binary: new DefaultExecutionBinaryService(this.binaryStorage, args.workflowId, args.runId, this.currentDate),
      getCredential: args.getCredential,
    };
  }
}
