"use client";
import { useMemo } from "react";

import type { ConnectionInvocationRecord, NodeExecutionSnapshot } from "../../realtime/realtimeDomainTypes";
import { VisibleNodeStatusResolver } from "../../canvas/VisibleNodeStatusResolver";

export function useWorkflowCanvasVisibleNodeStatuses(
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>,
  connectionInvocations?: ReadonlyArray<ConnectionInvocationRecord>,
): Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>> {
  return useMemo(
    () => VisibleNodeStatusResolver.resolveStatuses(nodeSnapshotsByNodeId, connectionInvocations),
    [connectionInvocations, nodeSnapshotsByNodeId],
  );
}
