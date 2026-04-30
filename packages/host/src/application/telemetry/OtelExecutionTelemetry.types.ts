import type { PersistedRunPolicySnapshot, TelemetryAttributes } from "@codemation/core";
import type {
  RunTraceContextRepository,
  TelemetryArtifactStore,
  TelemetryMetricPointStore,
  TelemetrySpanStore,
} from "../../domain/telemetry/TelemetryContracts";
import { OtelIdentityFactory } from "./OtelIdentityFactory";
import { TelemetryEnricherChain } from "./TelemetryEnricherChain";
import { TelemetryPrivacyPolicy } from "./TelemetryPrivacyPolicy";
import { TelemetryRetentionTimestampFactory } from "./TelemetryRetentionTimestampFactory";

export type StoredExecutionTelemetryDeps = Readonly<{
  traceId: string;
  rootSpanId: string;
  runId: string;
  workflowId: string;
  policySnapshot?: PersistedRunPolicySnapshot;
  runTraceContextRepository: RunTraceContextRepository;
  telemetrySpanStore: TelemetrySpanStore;
  telemetryArtifactStore: TelemetryArtifactStore;
  telemetryMetricPointStore: TelemetryMetricPointStore;
  telemetryEnricherChain: TelemetryEnricherChain;
  telemetryPrivacyPolicy: TelemetryPrivacyPolicy;
  telemetryRetentionTimestampFactory: TelemetryRetentionTimestampFactory;
  otelIdentityFactory: OtelIdentityFactory;
}>;

export type StoredSpanScopeArgs = StoredExecutionTelemetryDeps &
  Readonly<{
    spanId: string;
    parentSpanId?: string;
    nodeId?: string;
    activationId?: string;
    spanName: string;
    spanKind: "internal" | "client";
    initialAttributes?: TelemetryAttributes;
    initialStartTime?: Date;
    connectionInvocationId?: string;
    modelName?: string;
    iterationId?: string;
    itemIndex?: number;
    parentInvocationId?: string;
  }>;
