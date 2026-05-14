"use client";

import type { Logger } from "@codemation/host/client";
import type { ReactNode } from "react";

import { RealtimeContext } from "./RealtimeContext";
import { useWorkflowRealtimeInfrastructure } from "../../hooks/realtime/useWorkflowRealtimeInfrastructure";

export function WorkflowRealtimeProvider(
  args: Readonly<{
    children: ReactNode;
    logger: Logger;
    websocketPort?: string;
    wsBaseUrl?: string;
    getWsToken?: (opts?: Readonly<{ forceRefresh?: boolean }>) => Promise<string | null> | string | null;
  }>,
) {
  const { children, logger, websocketPort, wsBaseUrl, getWsToken } = args;
  const value = useWorkflowRealtimeInfrastructure({ logger, websocketPort, wsBaseUrl, getWsToken });
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
