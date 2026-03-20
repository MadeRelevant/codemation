import type { Logger } from "@codemation/frontend-src/application/logging/Logger";

import { BrowserLoggerFactory } from "@codemation/frontend-src/infrastructure/logging/BrowserLoggerFactory";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useState, type ReactNode } from "react";

import { RealtimeBoundary } from "./RealtimeBoundary";

export function Providers(args: Readonly<{ children: ReactNode; websocketPort?: string }>) {
  const { children, websocketPort } = args;
  const [loggerFactory] = useState(() => new BrowserLoggerFactory());
  const [realtimeLogger] = useState<Logger>(() => loggerFactory.create("workflow-realtime.frontend"));
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
      <RealtimeBoundary logger={realtimeLogger} websocketPort={websocketPort}>
        {children}
      </RealtimeBoundary>
    </QueryClientProvider>
  );
}
