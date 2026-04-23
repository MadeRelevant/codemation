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
    sourceOutputPorts: readonly string[];
    sourceOutputPortCounts: Readonly<Record<string, number>>;
    targetInputPorts: readonly string[];
  }>,
) {
  const {
    isNestedAgentAttachment,
    isAttachment,
    sourceOutputPorts,
    sourceOutputPortCounts,
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
        data-testid="canvas-handle-target-attachment"
      />
    );
  }

  const isTrigger = kind === "trigger";

  const targetHandles = isTrigger ? null : targetInputPorts.length <= 1 ? (
    <Handle
      type="target"
      position={Position.Left}
      id={targetInputPorts[0] ?? "in"}
      style={HANDLE_BOX_STYLE}
      data-testid={`canvas-handle-target-${targetInputPorts[0] ?? "in"}`}
    />
  ) : (
    <Handle
      type="target"
      position={Position.Left}
      style={HANDLE_CENTERED_STYLE}
      data-testid="canvas-handle-target-shared"
      data-ports={targetInputPorts.join(",")}
    />
  );

  const sourceHandlesRight =
    sourceOutputPorts.length <= 1 ? (
      <Handle
        type="source"
        position={Position.Right}
        id={sourceOutputPorts[0] ?? "main"}
        style={HANDLE_BOX_STYLE}
        data-testid={`canvas-handle-source-${sourceOutputPorts[0] ?? "main"}`}
      />
    ) : (
      <>
        {sourceOutputPorts.map((portName, index) => {
          const topPercent = ((index + 1) / (sourceOutputPorts.length + 1)) * 100;
          const itemCount = sourceOutputPortCounts[portName] ?? 0;
          return (
            <div
              key={portName}
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
              }}
            >
              <Handle
                type="source"
                position={Position.Right}
                id={portName}
                style={{
                  ...HANDLE_BOX_STYLE,
                  top: `${topPercent}%`,
                  transform: "translateY(-50%)",
                  pointerEvents: "auto",
                }}
                data-testid={`canvas-handle-source-${portName}`}
              />
              <div
                data-testid={`canvas-output-port-label-${portName}`}
                style={{
                  position: "absolute",
                  top: `${topPercent}%`,
                  right: -52,
                  transform: "translateY(-50%)",
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#475569",
                  background: "rgba(255,255,255,0.95)",
                  padding: "1px 4px",
                  borderRadius: 4,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                }}
              >
                {`${portName} (${itemCount})`}
              </div>
            </div>
          );
        })}
      </>
    );

  // Agent bottom source handles (LLM / TOOLS → attachment children) are
  // rendered as two fixed slots on the card by
  // {@link WorkflowCanvasCodemationNodeAgentBottomSourceHandles} at the
  // agent node's shell level, not here. Keeping the split lets that
  // component consume the agent-specific attachment flags
  // (`agentAttachments`) without threading them through every generic
  // node render.
  return (
    <>
      {targetHandles}
      {sourceHandlesRight}
    </>
  );
}
