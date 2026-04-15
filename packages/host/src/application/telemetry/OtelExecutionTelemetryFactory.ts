import type { ExecutionTelemetry, ExecutionTelemetryFactory, PersistedRunPolicySnapshot } from "@codemation/core";
import { inject, injectable } from "@codemation/core";
import { ApplicationTokens } from "../../applicationTokens";
import type {
  RunTraceContextRepository,
  TelemetryArtifactStore,
  TelemetryMetricPointStore,
  TelemetrySpanStore,
} from "../../domain/telemetry/TelemetryContracts";
import { OtelIdentityFactory } from "./OtelIdentityFactory";
import { StoredExecutionTelemetry } from "./StoredExecutionTelemetry";
import { TelemetryEnricherChain } from "./TelemetryEnricherChain";
import { TelemetryPrivacyPolicy } from "./TelemetryPrivacyPolicy";
import { TelemetryRetentionTimestampFactory } from "./TelemetryRetentionTimestampFactory";

@injectable()
export class OtelExecutionTelemetryFactory implements ExecutionTelemetryFactory {
  constructor(
    @inject(ApplicationTokens.RunTraceContextRepository)
    private readonly runTraceContextRepository: RunTraceContextRepository,
    @inject(ApplicationTokens.TelemetrySpanStore)
    private readonly telemetrySpanStore: TelemetrySpanStore,
    @inject(ApplicationTokens.TelemetryArtifactStore)
    private readonly telemetryArtifactStore: TelemetryArtifactStore,
    @inject(ApplicationTokens.TelemetryMetricPointStore)
    private readonly telemetryMetricPointStore: TelemetryMetricPointStore,
    @inject(TelemetryEnricherChain)
    private readonly telemetryEnricherChain: TelemetryEnricherChain,
    @inject(TelemetryPrivacyPolicy)
    private readonly telemetryPrivacyPolicy: TelemetryPrivacyPolicy,
    @inject(TelemetryRetentionTimestampFactory)
    private readonly telemetryRetentionTimestampFactory: TelemetryRetentionTimestampFactory,
    @inject(OtelIdentityFactory)
    private readonly otelIdentityFactory: OtelIdentityFactory,
  ) {}

  create(
    args: Readonly<{ runId: string; workflowId: string; policySnapshot?: PersistedRunPolicySnapshot }>,
  ): ExecutionTelemetry {
    return new StoredExecutionTelemetry({
      traceId: this.otelIdentityFactory.createTraceId(args.runId),
      rootSpanId: this.otelIdentityFactory.createRootSpanId(args.runId),
      runId: args.runId,
      workflowId: args.workflowId,
      policySnapshot: args.policySnapshot,
      runTraceContextRepository: this.runTraceContextRepository,
      telemetrySpanStore: this.telemetrySpanStore,
      telemetryArtifactStore: this.telemetryArtifactStore,
      telemetryMetricPointStore: this.telemetryMetricPointStore,
      telemetryEnricherChain: this.telemetryEnricherChain,
      telemetryPrivacyPolicy: this.telemetryPrivacyPolicy,
      telemetryRetentionTimestampFactory: this.telemetryRetentionTimestampFactory,
      otelIdentityFactory: this.otelIdentityFactory,
    });
  }
}
