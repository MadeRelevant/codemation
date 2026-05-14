"use client";

import type { Logger } from "@codemation/host/client";

import { BrowserLoggerFactory, logLevelPolicyFactory } from "@codemation/host/client";

import type { DehydratedState } from "@tanstack/react-query";
import { HydrationBoundary, QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useState, type ReactNode } from "react";

import { WorkflowCanvasApiClientProvider, createWorkflowCanvasApiClient } from "@codemation/canvas";
import { RealtimeBoundary } from "./RealtimeBoundary";

export function Providers(
  args: Readonly<{ children: ReactNode; websocketPort?: string; dehydratedState?: DehydratedState }>,
) {
  const { children, websocketPort, dehydratedState } = args;
  const defaultQueryStaleTimeMs = process.env.NODE_ENV === "development" ? 30_000 : 0;
  const [loggerFactory] = useState(() => new BrowserLoggerFactory(logLevelPolicyFactory.create()));
  const [realtimeLogger] = useState<Logger>(() => loggerFactory.create("workflow-realtime.frontend"));
  const [apiClient] = useState(() => createWorkflowCanvasApiClient({ apiBase: "", getToken: () => null }));
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
      <WorkflowCanvasApiClientProvider value={apiClient}>
        <RealtimeBoundary logger={realtimeLogger} websocketPort={websocketPort}>
          <HydrationBoundary state={dehydratedState}>{children}</HydrationBoundary>
        </RealtimeBoundary>
      </WorkflowCanvasApiClientProvider>
    </QueryClientProvider>
  );
}
