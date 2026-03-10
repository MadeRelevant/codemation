"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { BrowserLoggerFactory } from "../_logging/browserLoggerFactory";
import { WorkflowRealtimeProvider } from "../_realtime/realtime";

export function AppProviders(args: { children: ReactNode; websocketPort?: string }) {
  const { children, websocketPort } = args;
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
      <WorkflowRealtimeProvider logger={realtimeLogger} websocketPort={websocketPort}>
        {children}
      </WorkflowRealtimeProvider>
    </QueryClientProvider>
  );
}
