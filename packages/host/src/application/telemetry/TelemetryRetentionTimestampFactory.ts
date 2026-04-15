import type { PersistedRunPolicySnapshot } from "@codemation/core";
import { injectable } from "@codemation/core";

@injectable()
export class TelemetryRetentionTimestampFactory {
  createSpanExpiry(policySnapshot: PersistedRunPolicySnapshot | undefined, observedAt: Date): string | undefined {
    return this.createExpiry(policySnapshot?.telemetrySpanRetentionSeconds, observedAt);
  }

  createArtifactExpiry(policySnapshot: PersistedRunPolicySnapshot | undefined, observedAt: Date): string | undefined {
    return this.createExpiry(policySnapshot?.telemetryArtifactRetentionSeconds, observedAt);
  }

  createMetricExpiry(policySnapshot: PersistedRunPolicySnapshot | undefined, observedAt: Date): string | undefined {
    return this.createExpiry(policySnapshot?.telemetryMetricRetentionSeconds, observedAt);
  }

  createTraceContextExpiry(
    policySnapshot: PersistedRunPolicySnapshot | undefined,
    observedAt: Date,
  ): string | undefined {
    const candidates = [
      policySnapshot?.telemetrySpanRetentionSeconds,
      policySnapshot?.telemetryArtifactRetentionSeconds,
      policySnapshot?.telemetryMetricRetentionSeconds,
    ].filter((value): value is number => typeof value === "number" && value > 0);
    if (candidates.length === 0) {
      return undefined;
    }
    const maxSeconds = Math.max(...candidates);
    return this.createExpiry(maxSeconds, observedAt);
  }

  private createExpiry(retentionSeconds: number | undefined, observedAt: Date): string | undefined {
    if (!retentionSeconds || retentionSeconds <= 0) {
      return undefined;
    }
    return new Date(observedAt.getTime() + retentionSeconds * 1000).toISOString();
  }
}
