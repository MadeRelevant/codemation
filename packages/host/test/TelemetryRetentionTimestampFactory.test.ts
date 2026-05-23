import { describe, it, expect } from "vitest";
import { TelemetryRetentionTimestampFactory } from "../src/application/telemetry/TelemetryRetentionTimestampFactory";

describe("TelemetryRetentionTimestampFactory", () => {
  const factory = new TelemetryRetentionTimestampFactory();
  const now = new Date("2026-01-01T00:00:00.000Z");

  it("uses 7-day default for spans when no policy snapshot is provided", () => {
    const expiry = factory.createSpanExpiry(undefined, now);
    const expiryMs = new Date(expiry).getTime();
    const expectedMs = now.getTime() + 7 * 24 * 3600 * 1000;
    expect(expiryMs).toBe(expectedMs);
  });

  it("uses 3-day default for artifacts when no policy snapshot is provided", () => {
    const expiry = factory.createArtifactExpiry(undefined, now);
    const expiryMs = new Date(expiry).getTime();
    const expectedMs = now.getTime() + 3 * 24 * 3600 * 1000;
    expect(expiryMs).toBe(expectedMs);
  });

  it("uses 30-day default for metrics when no policy snapshot is provided", () => {
    const expiry = factory.createMetricExpiry(undefined, now);
    const expiryMs = new Date(expiry).getTime();
    const expectedMs = now.getTime() + 30 * 24 * 3600 * 1000;
    expect(expiryMs).toBe(expectedMs);
  });

  it("policy snapshot values override the defaults", () => {
    const snapshot = {
      telemetrySpanRetentionSeconds: 3600,
      telemetryArtifactRetentionSeconds: 7200,
      telemetryMetricRetentionSeconds: 14400,
    } as Parameters<typeof factory.createSpanExpiry>[0];

    const spanExpiry = factory.createSpanExpiry(snapshot, now);
    expect(new Date(spanExpiry).getTime()).toBe(now.getTime() + 3600 * 1000);

    const artifactExpiry = factory.createArtifactExpiry(snapshot, now);
    expect(new Date(artifactExpiry).getTime()).toBe(now.getTime() + 7200 * 1000);

    const metricExpiry = factory.createMetricExpiry(snapshot, now);
    expect(new Date(metricExpiry).getTime()).toBe(now.getTime() + 14400 * 1000);
  });

  it("createTraceContextExpiry uses the longest of the three default windows", () => {
    const expiry = factory.createTraceContextExpiry(undefined, now);
    const expiryMs = new Date(expiry).getTime();
    // Longest default: 30 days (metric)
    const expectedMs = now.getTime() + 30 * 24 * 3600 * 1000;
    expect(expiryMs).toBe(expectedMs);
  });

  it("returns ISO string format", () => {
    const expiry = factory.createSpanExpiry(undefined, now);
    expect(expiry).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});
