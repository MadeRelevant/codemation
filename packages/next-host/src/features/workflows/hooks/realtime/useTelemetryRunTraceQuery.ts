"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { fetchTelemetryRunTrace } from "../../lib/realtime/realtimeApi";
import { telemetryRunTraceQueryKey } from "../../lib/realtime/realtimeQueryKeys";
import type { PersistedRunState } from "../../lib/realtime/realtimeDomainTypes";
import { resolveTelemetryTraceRefetchIntervalMs } from "./runQueryPolling";

export function useTelemetryRunTraceQuery(
  runId: string | null | undefined,
  options: Readonly<{
    disableFetch?: boolean;
    pollWhileNonTerminalMs?: number;
    runStatus?: PersistedRunState["status"];
  }> = {},
) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: runId ? telemetryRunTraceQueryKey(runId) : ["telemetry-run-trace", "disabled"],
    queryFn: async ({ signal }) => await fetchTelemetryRunTrace(runId!, { signal }),
    enabled: Boolean(runId) && !options.disableFetch,
    retry: false,
    staleTime: 30_000,
    refetchInterval: () =>
      resolveTelemetryTraceRefetchIntervalMs({
        runStatus: options.runStatus,
        pollWhileNonTerminalMs: options.pollWhileNonTerminalMs,
      }),
  });

  const previousStatusRef = useRef<PersistedRunState["status"] | undefined>(options.runStatus);
  useEffect(() => {
    const previous = previousStatusRef.current;
    const current = options.runStatus;
    previousStatusRef.current = current;
    if (!runId) return;
    const wasNonTerminal = previous !== "completed" && previous !== "failed";
    const isTerminal = current === "completed" || current === "failed";
    if (wasNonTerminal && isTerminal) {
      void queryClient.invalidateQueries({ queryKey: telemetryRunTraceQueryKey(runId) });
    }
  }, [options.runStatus, runId, queryClient]);

  return query;
}
