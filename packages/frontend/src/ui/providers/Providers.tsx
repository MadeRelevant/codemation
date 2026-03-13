import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { BrowserLoggerFactory } from "../../infrastructure/logging/BrowserLoggerFactory";
import type { Logger } from "../../application/logging/Logger";
import { WorkflowRealtimeProvider } from "../realtime/realtime";

export function Providers(args: Readonly<{ children: ReactNode; websocketPort?: string }>) {
  const { children, websocketPort } = args;
  const [loggerFactory] = useState(() => new BrowserLoggerFactory());
  const [realtimeLogger] = useState(() => loggerFactory.create("workflow-realtime.frontend"));
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

function RealtimeBoundary(args: Readonly<{ children: ReactNode; logger: Logger; websocketPort?: string }>) {
  const { children, logger, websocketPort } = args;
  if (typeof window === "undefined") {
    return <>{children}</>;
  }
  return (
    <WorkflowRealtimeProvider logger={logger} websocketPort={websocketPort}>
      {children}
    </WorkflowRealtimeProvider>
  );
}
