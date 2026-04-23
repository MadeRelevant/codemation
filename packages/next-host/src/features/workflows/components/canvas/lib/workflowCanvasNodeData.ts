import type { NodeExecutionSnapshot } from "../../../lib/realtime/realtimeDomainTypes";

/**
 * Which attachment relationships an agent card exposes dedicated bottom
 * source handles + chip labels for. The card owns exactly two fixed
 * handle/chip slots — one for its LLM child(ren) (bottom-left) and one
 * for its tool / nested-agent children (bottom-right) — so React Flow's
 * smoothstep routing emanates from a clearly-visible card anchor and
 * fans out to each child below.
 *
 * A flag is `true` iff the agent has at least one child of that role.
 * Non-agent nodes (or agents without attachments of a given role) leave
 * the flag `false` so no handle / chip is rendered.
 */
export type AgentAttachmentFlags = Readonly<{
  hasLanguageModel: boolean;
  hasTools: boolean;
}>;

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
  /** When true, empty main batches still schedule downstream; surfaced on the canvas. */
  continueWhenEmptyOutput?: boolean;
  /** When set, show a credential warning icon with this tooltip (required slot unbound). */
  credentialAttentionTooltip?: string;
  /** Distinct source output port names on this node (for multi-handle Right routing). */
  sourceOutputPorts: readonly string[];
  /** Item counts keyed by source output port name. */
  sourceOutputPortCounts: Readonly<Record<string, number>>;
  /** Distinct target input port names on this node (for multi-handle Left routing). */
  targetInputPorts: readonly string[];
  /**
   * Which attachment handle/chip slots the agent card renders. Both flags
   * are `false` for non-agent nodes and for agents with no attachments of
   * a given role. See {@link AgentAttachmentFlags}.
   */
  agentAttachments: AgentAttachmentFlags;
  /** Matches Dagre / React Flow measured bounds (label wrap + agent badge row). */
  layoutWidthPx: number;
  layoutHeightPx: number;
  onSelectNode: (nodeId: string) => void;
  onOpenPropertiesNode: (nodeId: string) => void;
  onRunNode: (nodeId: string) => void;
  onTogglePinnedOutput: (nodeId: string) => void;
  onEditNodeOutput: (nodeId: string) => void;
  onClearPinnedOutput: (nodeId: string) => void;
  /** Live workflow: node has a bound credential — toolbar can open the edit dialog. */
  showCredentialEditToolbar?: boolean;
  /** Opens properties (if needed) and the credential edit dialog for this node. */
  onOpenCredentialEditFromCanvas?: () => void;
}>;
