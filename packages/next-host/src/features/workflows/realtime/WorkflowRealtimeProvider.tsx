"use client";

import type { Logger } from "@codemation/host-src/application/logging/Logger";
import type { ReactNode } from "react";

import { RealtimeContext } from "./RealtimeContext";
import { useWorkflowRealtimeInfrastructure } from "./useWorkflowRealtimeInfrastructure";

export function WorkflowRealtimeProvider(args: Readonly<{ children: ReactNode; logger: Logger; websocketPort?: string }>) {
  const { children, logger, websocketPort } = args;
  const value = useWorkflowRealtimeInfrastructure({ logger, websocketPort });
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
