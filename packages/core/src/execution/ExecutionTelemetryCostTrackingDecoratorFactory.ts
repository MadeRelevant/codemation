import type { CostTrackingTelemetry } from "../contracts/CostTrackingTelemetryContract";
import type {
  ExecutionTelemetry,
  NodeExecutionTelemetry,
  TelemetryArtifactAttachment,
  TelemetryArtifactReference,
  TelemetryChildSpanStart,
  TelemetryMetricRecord,
  TelemetrySpanEnd,
  TelemetrySpanEventRecord,
  TelemetrySpanScope,
} from "../contracts/telemetryTypes";
import type { NodeActivationId, NodeId } from "../contracts/workflowTypes";

export class ExecutionTelemetryCostTrackingDecoratorFactory {
  decorateExecutionTelemetry(args: {
    telemetry: ExecutionTelemetry;
    costTracking: CostTrackingTelemetry;
  }): ExecutionTelemetry {
    return {
      traceId: args.telemetry.traceId,
      spanId: args.telemetry.spanId,
      costTracking: args.costTracking,
      addSpanEvent: (event: TelemetrySpanEventRecord) => args.telemetry.addSpanEvent(event),
      recordMetric: (metric: TelemetryMetricRecord) => args.telemetry.recordMetric(metric),
      attachArtifact: (
        artifact: TelemetryArtifactAttachment,
      ): Promise<TelemetryArtifactReference> | TelemetryArtifactReference => args.telemetry.attachArtifact(artifact),
      forNode: (nodeArgs: Readonly<{ nodeId: NodeId; activationId: NodeActivationId }>): NodeExecutionTelemetry => {
        const nodeTelemetry = args.telemetry.forNode(nodeArgs);
        return this.decorateNodeExecutionTelemetry({
          telemetry: nodeTelemetry,
          costTracking: args.costTracking.forScope(nodeTelemetry),
        });
      },
    };
  }

  private decorateNodeExecutionTelemetry(args: {
    telemetry: NodeExecutionTelemetry;
    costTracking: CostTrackingTelemetry;
  }): NodeExecutionTelemetry {
    return {
      traceId: args.telemetry.traceId,
      spanId: args.telemetry.spanId,
      costTracking: args.costTracking,
      addSpanEvent: (event: TelemetrySpanEventRecord) => args.telemetry.addSpanEvent(event),
      recordMetric: (metric: TelemetryMetricRecord) => args.telemetry.recordMetric(metric),
      attachArtifact: (
        artifact: TelemetryArtifactAttachment,
      ): Promise<TelemetryArtifactReference> | TelemetryArtifactReference => args.telemetry.attachArtifact(artifact),
      end: (endArgs?: TelemetrySpanEnd) => args.telemetry.end(endArgs),
      startChildSpan: (spanArgs: TelemetryChildSpanStart): TelemetrySpanScope =>
        this.decorateTelemetrySpanScope({
          scope: args.telemetry.startChildSpan(spanArgs),
          costTracking: args.costTracking,
        }),
      forNode: (nodeArgs: Readonly<{ nodeId: NodeId; activationId: NodeActivationId }>): NodeExecutionTelemetry => {
        const nodeTelemetry = args.telemetry.forNode(nodeArgs);
        return this.decorateNodeExecutionTelemetry({
          telemetry: nodeTelemetry,
          costTracking: args.costTracking.forScope(nodeTelemetry),
        });
      },
      asNodeTelemetry: (
        rescope: Readonly<{ nodeId: NodeId; activationId: NodeActivationId }>,
      ): NodeExecutionTelemetry => {
        const nodeTelemetry = args.telemetry.asNodeTelemetry(rescope);
        return this.decorateNodeExecutionTelemetry({
          telemetry: nodeTelemetry,
          costTracking: args.costTracking.forScope(nodeTelemetry),
        });
      },
    };
  }

  private decorateTelemetrySpanScope(args: {
    scope: TelemetrySpanScope;
    costTracking: CostTrackingTelemetry;
  }): TelemetrySpanScope {
    return {
      traceId: args.scope.traceId,
      spanId: args.scope.spanId,
      costTracking: args.costTracking.forScope(args.scope),
      addSpanEvent: (event: TelemetrySpanEventRecord) => args.scope.addSpanEvent(event),
      recordMetric: (metric: TelemetryMetricRecord) => args.scope.recordMetric(metric),
      attachArtifact: (
        artifact: TelemetryArtifactAttachment,
      ): Promise<TelemetryArtifactReference> | TelemetryArtifactReference => args.scope.attachArtifact(artifact),
      end: (endArgs?: TelemetrySpanEnd) => args.scope.end(endArgs),
      asNodeTelemetry: (
        rescope: Readonly<{ nodeId: NodeId; activationId: NodeActivationId }>,
      ): NodeExecutionTelemetry => {
        const nodeTelemetry = args.scope.asNodeTelemetry(rescope);
        return this.decorateNodeExecutionTelemetry({
          telemetry: nodeTelemetry,
          costTracking: args.costTracking.forScope(nodeTelemetry),
        });
      },
    };
  }
}
