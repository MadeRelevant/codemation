"use client";

import type { Logger } from "@codemation/host-src/application/logging/Logger";

import { BrowserLoggerFactory } from "@codemation/host-src/infrastructure/logging/BrowserLoggerFactory";
import { logLevelPolicyFactory } from "@codemation/host-src/infrastructure/logging/LogLevelPolicyFactory";

import type { DehydratedState } from "@tanstack/react-query";
import { HydrationBoundary, QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useState, type ReactNode } from "react";

import { RealtimeBoundary } from "./RealtimeBoundary";

export function Providers(
  args: Readonly<{ children: ReactNode; websocketPort?: string; dehydratedState?: DehydratedState }>,
) {
  const { children, websocketPort, dehydratedState } = args;
  const defaultQueryStaleTimeMs = process.env.NODE_ENV === "development" ? 30_000 : 0;
  const [loggerFactory] = useState(() => new BrowserLoggerFactory(logLevelPolicyFactory.create()));
  const [realtimeLogger] = useState<Logger>(() => loggerFactory.create("workflow-realtime.frontend"));
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: defaultQueryStaleTimeMs,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeBoundary logger={realtimeLogger} websocketPort={websocketPort}>
        <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary>
      </RealtimeBoundary>
    </QueryClientProvider>
  );
}
