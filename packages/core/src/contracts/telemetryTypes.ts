import type {
  JsonValue,
  NodeActivationId,
  NodeId,
  ParentExecutionRef,
  PersistedRunPolicySnapshot,
  RunId,
  WorkflowId,
} from "./workflowTypes";

export type TelemetryAttributePrimitive = string | number | boolean | null;

export interface TelemetryAttributes {
  readonly [key: string]: TelemetryAttributePrimitive | undefined;
}

export interface TelemetryMetricRecord {
  readonly name: string;
  readonly value: number;
  readonly unit?: string;
  readonly attributes?: TelemetryAttributes;
}

export interface TelemetrySpanEventRecord {
  readonly name: string;
  readonly occurredAt?: Date;
  readonly attributes?: TelemetryAttributes;
}

export interface TelemetryArtifactAttachment {
  readonly kind: string;
  readonly contentType: string;
  readonly previewText?: string;
  readonly previewJson?: JsonValue;
  readonly payloadText?: string;
  readonly payloadJson?: JsonValue;
  readonly bytes?: number;
  readonly truncated?: boolean;
  readonly expiresAt?: Date;
}

export interface TelemetryArtifactReference {
  readonly artifactId: string;
  readonly traceId?: string;
  readonly spanId?: string;
}

export interface TelemetrySpanEnd {
  readonly status?: "ok" | "error";
  readonly statusMessage?: string;
  readonly endedAt?: Date;
  readonly attributes?: TelemetryAttributes;
}

export interface TelemetryChildSpanStart {
  readonly name: string;
  readonly kind?: "internal" | "client";
  readonly startedAt?: Date;
  readonly attributes?: TelemetryAttributes;
}

export interface TelemetryScope {
  readonly traceId?: string;
  readonly spanId?: string;
  addSpanEvent(args: TelemetrySpanEventRecord): Promise<void> | void;
  recordMetric(args: TelemetryMetricRecord): Promise<void> | void;
  attachArtifact(args: TelemetryArtifactAttachment): Promise<TelemetryArtifactReference> | TelemetryArtifactReference;
}

export interface TelemetrySpanScope extends TelemetryScope {
  readonly traceId: string;
  readonly spanId: string;
  end(args?: TelemetrySpanEnd): Promise<void> | void;
}

export interface NodeExecutionTelemetry extends ExecutionTelemetry, TelemetrySpanScope {
  startChildSpan(args: TelemetryChildSpanStart): TelemetrySpanScope;
}

export interface ExecutionTelemetry extends TelemetryScope {
  readonly traceId: string;
  readonly spanId: string;
  forNode(args: Readonly<{ nodeId: NodeId; activationId: NodeActivationId }>): NodeExecutionTelemetry;
}

export interface ExecutionTelemetryFactory {
  create(
    args: Readonly<{
      runId: RunId;
      workflowId: WorkflowId;
      parent?: ParentExecutionRef;
      policySnapshot?: PersistedRunPolicySnapshot;
    }>,
  ): ExecutionTelemetry;
}
export { NoOpTelemetryArtifactReference } from "./NoOpTelemetryArtifactReference";
export { NoOpTelemetrySpanScope } from "./NoOpTelemetrySpanScope";
export { NoOpNodeExecutionTelemetry } from "./NoOpNodeExecutionTelemetry";
export { NoOpExecutionTelemetry } from "./NoOpExecutionTelemetry";
export { NoOpExecutionTelemetryFactory } from "./NoOpExecutionTelemetryFactory";
export { CodemationTelemetryAttributeNames } from "./CodemationTelemetryAttributeNames";
export { GenAiTelemetryAttributeNames } from "./GenAiTelemetryAttributeNames";
export { CodemationTelemetryMetricNames } from "./CodemationTelemetryMetricNames";
