import type { Logger } from "@codemation/host-src/application/logging/Logger";

import type { ReactNode } from "react";

import { WorkflowRealtimeProvider } from "../features/workflows/realtime/realtime";

export function RealtimeBoundary(args: Readonly<{ children: ReactNode; logger: Logger; websocketPort?: string }>) {
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
