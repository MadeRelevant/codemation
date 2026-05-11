"use client";

import type { Logger } from "@codemation/host/client";
import type { ReactNode } from "react";

import { RealtimeContext } from "./RealtimeContext";
import { useWorkflowRealtimeInfrastructure } from "../../hooks/realtime/useWorkflowRealtimeInfrastructure";

export function WorkflowRealtimeProvider(
  args: Readonly<{ children: ReactNode; logger: Logger; websocketPort?: string; wsBaseUrl?: string }>,
) {
  const { children, logger, websocketPort, wsBaseUrl } = args;
  const value = useWorkflowRealtimeInfrastructure({ logger, websocketPort, wsBaseUrl });
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
