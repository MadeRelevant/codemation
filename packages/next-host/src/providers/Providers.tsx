import type { Logger } from "@codemation/host-src/application/logging/Logger";

import { BrowserLoggerFactory } from "@codemation/host-src/infrastructure/logging/BrowserLoggerFactory";
import { logLevelPolicyFactory } from "@codemation/host-src/infrastructure/logging/LogLevelPolicyFactory";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { useState, type ReactNode } from "react";

import { RealtimeBoundary } from "./RealtimeBoundary";

export function Providers(args: Readonly<{ children: ReactNode; websocketPort?: string }>) {
  const { children, websocketPort } = args;
  const [loggerFactory] = useState(() => new BrowserLoggerFactory(logLevelPolicyFactory.create()));
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
