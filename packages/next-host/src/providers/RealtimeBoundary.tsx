import type { Logger } from "@codemation/host/client";

import type { ReactNode } from "react";

import { WorkflowRealtimeProvider } from "@codemation/canvas";

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
