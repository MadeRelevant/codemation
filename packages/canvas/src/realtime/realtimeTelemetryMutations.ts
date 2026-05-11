import type { QueryClient } from "@tanstack/react-query";
import type { TelemetryRunTraceViewDto, TelemetrySpanRecordDto } from "./realtimeDomainTypes";
import { telemetryRunTraceQueryKey } from "./realtimeQueryKeys";

/**
 * Splices an incoming span upsert into the cached telemetry trace for the given run.
 *
 * - If the cache is empty (initial HTTP fetch hasn't landed yet), this is a no-op.
 *   The initial fetch + reconnect catchup provide the snapshot; early WS spans will be
 *   superseded by the HTTP response once it resolves.
 * - Deduplicates by `spanId`: if the span is already present it is replaced in-place.
 * - The resulting list is sorted by `startTime` ascending (nulls last).
 */
export function applyTelemetrySpanEvent(
  queryClient: QueryClient,
  runId: string,
  incomingSpan: TelemetrySpanRecordDto,
): void {
  const key = telemetryRunTraceQueryKey(runId);
  const existing = queryClient.getQueryData<TelemetryRunTraceViewDto>(key);
  if (!existing) {
    // Cache is cold — initial HTTP fetch will include this span. No-op.
    return;
  }
  const spans = mergeSpan(existing.spans, incomingSpan);
  queryClient.setQueryData<TelemetryRunTraceViewDto>(key, {
    ...existing,
    spans,
  });
}

function mergeSpan(
  current: ReadonlyArray<TelemetrySpanRecordDto>,
  incoming: TelemetrySpanRecordDto,
): ReadonlyArray<TelemetrySpanRecordDto> {
  let replaced = false;
  const next: TelemetrySpanRecordDto[] = current.map((span) => {
    if (span.spanId === incoming.spanId) {
      replaced = true;
      return incoming;
    }
    return span;
  });
  if (!replaced) {
    next.push(incoming);
  }
  next.sort((a, b) => compareSpanStartTime(a.startTime, b.startTime));
  return next;
}

function compareSpanStartTime(a: string | undefined, b: string | undefined): number {
  if (a === undefined && b === undefined) return 0;
  if (a === undefined) return 1;
  if (b === undefined) return -1;
  return a.localeCompare(b);
}
