import type { TelemetryDashboardBucketIntervalDto } from "@codemation/host-src/application/contracts/TelemetryDashboardContracts";
import prettyMs from "pretty-ms";

export class DashboardDateTimeFormatter {
  private static readonly timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  private static readonly dayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });

  private static readonly timestampFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  static formatBucketLabel(interval: TelemetryDashboardBucketIntervalDto, bucketStartIso: string): string {
    const date = new Date(bucketStartIso);
    if (interval === "minute_5" || interval === "minute_15" || interval === "hour") {
      return `${this.timeFormatter.format(date)} UTC`;
    }
    return this.dayFormatter.format(date);
  }

  static formatTimestamp(timestampIso: string): string {
    return `${this.timestampFormatter.format(new Date(timestampIso))} UTC`;
  }

  static formatDuration(startedAt: string, finishedAt: string | undefined): string {
    if (!finishedAt) {
      return "In progress";
    }
    const durationMs = Date.parse(finishedAt) - Date.parse(startedAt);
    if (!Number.isFinite(durationMs) || durationMs < 0) {
      return "Unknown";
    }
    return prettyMs(durationMs, { compact: true });
  }
}
