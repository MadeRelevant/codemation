import { Handle, Position } from "@xyflow/react";

const HANDLE_STYLE = {
  width: 8,
  height: 8,
  border: "1px solid white",
} as const;

/**
 * Bottom LLM/tools sources aligned with the bottom of the main card square (not the full node height).
 * Attachment edges may overlap the agent badge row and node title; users can pan if needed.
 */
export function WorkflowCanvasCodemationNodeAgentBottomSourceHandles(
  props: Readonly<{ offsetFromNodeBottomPx: number }>,
) {
  const { offsetFromNodeBottomPx } = props;
  return (
    <>
      <Handle
        type="source"
        position={Position.Bottom}
        id="attachment-llm-source"
        style={{
          ...HANDLE_STYLE,
          left: "34%",
          background: "#2563eb",
          bottom: offsetFromNodeBottomPx,
        }}
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="attachment-tools-source"
        style={{
          ...HANDLE_STYLE,
          left: "66%",
          background: "#7c3aed",
          bottom: offsetFromNodeBottomPx,
        }}
      />
    </>
  );
}
