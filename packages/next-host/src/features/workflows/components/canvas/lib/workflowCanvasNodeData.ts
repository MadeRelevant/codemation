import type { NodeExecutionSnapshot } from "../../../lib/realtime/realtimeDomainTypes";

export type WorkflowCanvasNodeData = Readonly<{
  nodeId: string;
  label: string;
  type: string;
  kind: string;
  role?: string;
  icon?: string;
  status?: NodeExecutionSnapshot["status"];
  selected: boolean;
  propertiesTarget: boolean;
  isAttachment: boolean;
  isPinned: boolean;
  hasOutputData: boolean;
  isLiveWorkflowView: boolean;
  isRunning: boolean;
  retryPolicySummary?: string;
  hasNodeErrorHandler?: boolean;
  /** When set, show a credential warning icon with this tooltip (required slot unbound). */
  credentialAttentionTooltip?: string;
  /** Distinct source output port names on this node (for multi-handle Right routing). */
  sourceOutputPorts: readonly string[];
  /** Distinct target input port names on this node (for multi-handle Left routing). */
  targetInputPorts: readonly string[];
  onSelectNode: (nodeId: string) => void;
  onOpenPropertiesNode: (nodeId: string) => void;
  onRunNode: (nodeId: string) => void;
  onTogglePinnedOutput: (nodeId: string) => void;
  onEditNodeOutput: (nodeId: string) => void;
  onClearPinnedOutput: (nodeId: string) => void;
}>;
