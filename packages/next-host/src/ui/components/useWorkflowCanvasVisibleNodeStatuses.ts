import { useMemo } from "react";

import type { NodeExecutionSnapshot } from "../realtime/realtime";
import { VisibleNodeStatusResolver } from "./VisibleNodeStatusResolver";

export function useWorkflowCanvasVisibleNodeStatuses(
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>,
): Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>> {
  return useMemo(() => VisibleNodeStatusResolver.resolveStatuses(nodeSnapshotsByNodeId), [nodeSnapshotsByNodeId]);
}
