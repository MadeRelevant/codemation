import { Handle, Position } from "@xyflow/react";

import type { AgentAttachmentFlags } from "./lib/workflowCanvasNodeData";

/**
 * Horizontal placement of the LLM / TOOLS attachment source handles on
 * the agent card's bottom edge. The two slots sit inside the card's
 * horizontal span so the dashed attachment edges visibly leave the card
 * (not float in a void beneath it) and the left/right split matches the
 * LLM/TOOLS chip row directly above — a user reading the canvas sees
 * "LLM on the left, Tools on the right" both in the label row and in
 * where the dashed lines start.
 */
const LLM_HANDLE_LEFT_PCT = 30;
const TOOLS_HANDLE_LEFT_PCT = 70;

const HANDLE_STYLE = {
  width: 8,
  height: 8,
  border: "1px solid white",
} as const;

const LLM_HANDLE_BG = "#2563eb";
const TOOLS_HANDLE_BG = "#7c3aed";

/**
 * Renders the two fixed attachment source handles on an agent card's
 * bottom edge: one for its language-model child(ren) and one for its
 * tool / nested-agent child(ren). Each handle is rendered **iff** the
 * agent actually has at least one child of that role, so non-agent
 * nodes and agents missing one of the two relationship types emit no
 * spurious handles. React Flow routes every attachment edge from one of
 * these two anchor points via `smoothstep`, so the card stays the
 * visible origin of each dashed line even when the child row spreads
 * wider than the card.
 *
 * Handle ids (`attachment-source-llm`, `attachment-source-tools`) match
 * what {@link WorkflowElkResultMapper.buildReactFlowEdges} assigns to
 * each attachment edge based on the target child's role.
 */
export function WorkflowCanvasCodemationNodeAgentBottomSourceHandles(
  props: Readonly<{ agentAttachments: AgentAttachmentFlags }>,
) {
  const { hasLanguageModel, hasTools } = props.agentAttachments;
  return (
    <>
      {hasLanguageModel ? (
        <Handle
          type="source"
          position={Position.Bottom}
          id="attachment-source-llm"
          style={{
            ...HANDLE_STYLE,
            left: `${LLM_HANDLE_LEFT_PCT}%`,
            background: LLM_HANDLE_BG,
          }}
          data-testid="canvas-handle-source-attachment-llm"
        />
      ) : null}
      {hasTools ? (
        <Handle
          type="source"
          position={Position.Bottom}
          id="attachment-source-tools"
          style={{
            ...HANDLE_STYLE,
            left: `${TOOLS_HANDLE_LEFT_PCT}%`,
            background: TOOLS_HANDLE_BG,
          }}
          data-testid="canvas-handle-source-attachment-tools"
        />
      ) : null}
    </>
  );
}
