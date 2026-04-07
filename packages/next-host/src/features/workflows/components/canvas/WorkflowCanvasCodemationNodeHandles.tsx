import { Handle, Position } from "@xyflow/react";

const HANDLE_BOX_STYLE = {
  width: 8,
  height: 8,
  background: "#111827",
  border: "1px solid white",
} as const;

/** Single centered handle on an edge so true/false (or merge inputs) share one symmetric opening. */
const HANDLE_CENTERED_STYLE = {
  ...HANDLE_BOX_STYLE,
  top: "50%",
} as const;

export function WorkflowCanvasCodemationNodeHandles(
  props: Readonly<{
    kind: string;
    /** Nested agent-as-tool: wide agent chrome but only the attachment input from the parent (bottom LLM/tools sources are separate). */
    isNestedAgentAttachment?: boolean;
    isAttachment: boolean;
    isAgent: boolean;
    /** When true, agent bottom LLM/tools handles are rendered on the shell (see WorkflowCanvasCodemationNodeAgentBottomSourceHandles). */
    omitAgentBottomSourceHandles: boolean;
    sourceOutputPorts: readonly string[];
    targetInputPorts: readonly string[];
  }>,
) {
  const {
    isNestedAgentAttachment,
    isAgent,
    isAttachment,
    omitAgentBottomSourceHandles,
    sourceOutputPorts,
    targetInputPorts,
    kind,
  } = props;

  if (isNestedAgentAttachment || isAttachment) {
    return (
      <Handle
        type="target"
        position={Position.Top}
        id="attachment-target"
        style={{ width: 8, height: 8, background: "#64748b", border: "1px solid white" }}
      />
    );
  }

  const isTrigger = kind === "trigger";

  const targetHandles = isTrigger ? null : targetInputPorts.length <= 1 ? (
    <Handle type="target" position={Position.Left} id={targetInputPorts[0] ?? "in"} style={HANDLE_BOX_STYLE} />
  ) : (
    <Handle type="target" position={Position.Left} style={HANDLE_CENTERED_STYLE} />
  );

  const sourceHandlesRight =
    sourceOutputPorts.length <= 1 ? (
      <Handle type="source" position={Position.Right} id={sourceOutputPorts[0] ?? "main"} style={HANDLE_BOX_STYLE} />
    ) : (
      <Handle type="source" position={Position.Right} style={HANDLE_CENTERED_STYLE} />
    );

  return (
    <>
      {targetHandles}
      {sourceHandlesRight}
      {isAgent && !omitAgentBottomSourceHandles ? (
        <>
          <Handle
            type="source"
            position={Position.Bottom}
            id="attachment-llm-source"
            style={{ left: "34%", width: 8, height: 8, background: "#2563eb", border: "1px solid white" }}
          />
          <Handle
            type="source"
            position={Position.Bottom}
            id="attachment-tools-source"
            style={{ left: "66%", width: 8, height: 8, background: "#7c3aed", border: "1px solid white" }}
          />
        </>
      ) : null}
    </>
  );
}
