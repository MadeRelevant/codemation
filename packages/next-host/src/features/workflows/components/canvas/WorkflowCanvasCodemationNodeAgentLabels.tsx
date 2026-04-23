import { WORKFLOW_CANVAS_AGENT_BADGE_ROW_PX } from "./lib/workflowCanvasNodeGeometry";
import type { AgentAttachmentFlags } from "./lib/workflowCanvasNodeData";

/**
 * Horizontal placement of the LLM / TOOLS chips — kept **exactly** in
 * sync with the matching handle positions in
 * `WorkflowCanvasCodemationNodeAgentBottomSourceHandles` so each label
 * sits directly above the source handle it describes.
 */
const LLM_CHIP_LEFT_PCT = 30;
const TOOLS_CHIP_LEFT_PCT = 70;

type ChipVisual = Readonly<{ text: string; color: string; border: string; bg: string }>;

const LLM_CHIP_VISUAL: ChipVisual = {
  text: "LLM",
  color: "#1d4ed8",
  border: "#93c5fd",
  bg: "#eff6ff",
};
const TOOLS_CHIP_VISUAL: ChipVisual = {
  text: "Tools",
  color: "#6d28d9",
  border: "#c4b5fd",
  bg: "#f5f3ff",
};

function renderChip(visual: ChipVisual) {
  return (
    <div
      style={{
        padding: "2px 6px",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: 0.35,
        textTransform: "uppercase",
        color: visual.color,
        background: visual.bg,
        border: `1px dotted ${visual.border}`,
        whiteSpace: "nowrap",
        borderRadius: 4,
      }}
    >
      {visual.text}
    </div>
  );
}

/**
 * Renders the "LLM" / "Tools" chip row below an agent card. Each chip is
 * rendered iff the agent has at least one child of that role, and sits
 * at a fixed horizontal slot (30% for LLM on the left, 70% for Tools on
 * the right) — the same slot as the matching source handle below, so
 * the label visually explains where each dashed attachment edge
 * originates.
 *
 * The row's container fills the card's width and reserves a fixed
 * vertical slot (`WORKFLOW_CANVAS_AGENT_BADGE_ROW_PX`), matching the
 * shell height that the ELK sizing resolver reserves under the card.
 */
export function WorkflowCanvasCodemationNodeAgentLabels(
  props: Readonly<{ agentAttachments: AgentAttachmentFlags }>,
) {
  const { hasLanguageModel, hasTools } = props.agentAttachments;
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: WORKFLOW_CANVAS_AGENT_BADGE_ROW_PX,
        pointerEvents: "none",
      }}
      aria-hidden
    >
      {hasLanguageModel ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: `${LLM_CHIP_LEFT_PCT}%`,
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: WORKFLOW_CANVAS_AGENT_BADGE_ROW_PX,
          }}
          data-testid="canvas-agent-chip-languageModel"
        >
          {renderChip(LLM_CHIP_VISUAL)}
        </div>
      ) : null}
      {hasTools ? (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: `${TOOLS_CHIP_LEFT_PCT}%`,
            transform: "translateX(-50%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: WORKFLOW_CANVAS_AGENT_BADGE_ROW_PX,
          }}
          data-testid="canvas-agent-chip-tools"
        >
          {renderChip(TOOLS_CHIP_VISUAL)}
        </div>
      ) : null}
    </div>
  );
}
