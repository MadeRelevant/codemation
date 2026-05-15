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
    /**
     * Skip the /api/dev/health round-trip before flipping workflowSocketEnabled.
     * Useful when the consumer already verified the host is ready (e.g. fetched
     * workspace meta + minted a token).
     */
    skipDevHealthCheck?: boolean;
  }>,
) {
  const { children, logger, websocketPort, wsBaseUrl, getWsToken, skipDevHealthCheck } = args;
  const value = useWorkflowRealtimeInfrastructure({
    logger,
    websocketPort,
    wsBaseUrl,
    getWsToken,
    skipDevHealthCheck,
  });
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
