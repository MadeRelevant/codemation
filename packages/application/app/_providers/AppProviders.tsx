"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { BrowserLoggerFactory } from "../_logging/browserLoggerFactory";
import { WorkflowRealtimeProvider } from "../_realtime/realtime";

export function AppProviders(args: { children: ReactNode; websocketUrl: string }) {
  const { children, websocketUrl } = args;
  const [loggerFactory] = useState(() => new BrowserLoggerFactory());
  const [realtimeLogger] = useState(() => loggerFactory.create("workflow-realtime.client"));
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 0,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WorkflowRealtimeProvider websocketUrl={websocketUrl} logger={realtimeLogger}>
        {children}
      </WorkflowRealtimeProvider>
    </QueryClientProvider>
  );
}
