import type { PersistedRunPolicySnapshot } from "@codemation/core";
import { injectable } from "@codemation/core";

@injectable()
export class TelemetryRetentionTimestampFactory {
  /** Default span retention: 7 days (overridden by policySnapshot). */
  static readonly defaultSpanRetentionSeconds = 7 * 24 * 3600;
  /** Default artifact retention: 3 days (overridden by policySnapshot). */
  static readonly defaultArtifactRetentionSeconds = 3 * 24 * 3600;
  /** Default metric retention: 30 days (overridden by policySnapshot). */
  static readonly defaultMetricRetentionSeconds = 30 * 24 * 3600;

  createSpanExpiry(policySnapshot: PersistedRunPolicySnapshot | undefined, observedAt: Date): string {
    return this.createExpiry(
      policySnapshot?.telemetrySpanRetentionSeconds ?? TelemetryRetentionTimestampFactory.defaultSpanRetentionSeconds,
      observedAt,
    );
  }

  createArtifactExpiry(policySnapshot: PersistedRunPolicySnapshot | undefined, observedAt: Date): string {
    return this.createExpiry(
      policySnapshot?.telemetryArtifactRetentionSeconds ??
        TelemetryRetentionTimestampFactory.defaultArtifactRetentionSeconds,
      observedAt,
    );
  }

  createMetricExpiry(policySnapshot: PersistedRunPolicySnapshot | undefined, observedAt: Date): string {
    return this.createExpiry(
      policySnapshot?.telemetryMetricRetentionSeconds ??
        TelemetryRetentionTimestampFactory.defaultMetricRetentionSeconds,
      observedAt,
    );
  }

  createTraceContextExpiry(policySnapshot: PersistedRunPolicySnapshot | undefined, observedAt: Date): string {
    const candidates = [
      policySnapshot?.telemetrySpanRetentionSeconds ?? TelemetryRetentionTimestampFactory.defaultSpanRetentionSeconds,
      policySnapshot?.telemetryArtifactRetentionSeconds ??
        TelemetryRetentionTimestampFactory.defaultArtifactRetentionSeconds,
      policySnapshot?.telemetryMetricRetentionSeconds ??
        TelemetryRetentionTimestampFactory.defaultMetricRetentionSeconds,
    ].filter((value): value is number => typeof value === "number" && value > 0);
    const maxSeconds = Math.max(...candidates);
    return this.createExpiry(maxSeconds, observedAt);
  }

  private createExpiry(retentionSeconds: number, observedAt: Date): string {
    return new Date(observedAt.getTime() + retentionSeconds * 1000).toISOString();
  }
}
