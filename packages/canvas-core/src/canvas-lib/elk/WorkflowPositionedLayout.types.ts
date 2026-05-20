import type { WorkflowDto } from "@codemation/host/dto";

import type { WorkflowAbsolutePosition } from "./WorkflowElkAbsolutePositionsResolver";
import type { WorkflowElkNodeSizing } from "./WorkflowElkNodeSizingResolver";
import type { WorkflowElkPortInfo } from "./WorkflowElkPortInfoResolver";

/**
 * The structure-only output of ELK + sizing + port resolution. Computed once
 * per workflow structure and reused across every snapshot/status update so the
 * React Flow overlay (statuses, item counts, selection) doesn't pay for a new
 * ELK pass on every realtime event.
 */
export type WorkflowPositionedLayout = Readonly<{
  workflow: WorkflowDto;
  positionsByNodeId: ReadonlyMap<string, WorkflowAbsolutePosition>;
  portInfoByNodeId: ReadonlyMap<string, WorkflowElkPortInfo>;
  sizingByNodeId: ReadonlyMap<string, WorkflowElkNodeSizing>;
}>;
