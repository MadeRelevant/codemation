import { Handle,Position } from "@xyflow/react";

export function WorkflowCanvasCodemationNodeHandles(props: Readonly<{ isAttachment: boolean; isAgent: boolean }>) {
  const { isAgent, isAttachment } = props;
  return (
    <>
      <Handle
        type="target"
        position={isAttachment ? Position.Top : Position.Left}
        id={isAttachment ? "attachment-target" : undefined}
        style={{ width: 8, height: 8, background: isAttachment ? "#64748b" : "#111827", border: "1px solid white" }}
      />
      <Handle
        type="source"
        position={isAttachment ? Position.Bottom : Position.Right}
        style={{ width: 8, height: 8, background: "#111827", border: "1px solid white" }}
      />
      {isAgent ? (
        <Handle
          type="source"
          position={Position.Bottom}
          id="attachment-llm-source"
          style={{ left: "34%", width: 8, height: 8, background: "#2563eb", border: "1px solid white" }}
        />
      ) : null}
      {isAgent ? (
        <Handle
          type="source"
          position={Position.Bottom}
          id="attachment-tools-source"
          style={{ left: "66%", width: 8, height: 8, background: "#7c3aed", border: "1px solid white" }}
        />
      ) : null}
    </>
  );
}
