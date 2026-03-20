import type { LucideIcon } from "lucide-react";

import type { WorkflowCanvasNodeData } from "./workflowCanvasNodeData";
import { trailingIconForNode,trailingIconKindForNode } from "./workflowCanvasNodeChrome";

export function WorkflowCanvasCodemationNodeCard(props: Readonly<{ data: WorkflowCanvasNodeData; TypeIcon: LucideIcon }>) {
  const { TypeIcon, data } = props;
  const isAttachment = data.isAttachment;
  const isActive = data.status === "queued" || data.status === "running";
  const isSelected = data.selected;
  const isPropertiesTarget = data.propertiesTarget;
  const isPinned = data.isPinned;
  return (
    <div
      onClick={() => data.onOpenPropertiesNode(data.nodeId)}
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: isAttachment ? 8 : 10,
        height: "100%",
        padding: isAttachment ? "0 10px" : "0 10px",
        borderRadius: 0,
        border: isActive ? "1px solid transparent" : isPinned ? "1px solid #7c3aed" : isSelected ? "1px solid #111827" : isPropertiesTarget ? "1px solid #7c3aed" : "1px solid #d1d5db",
        background: isSelected ? (isAttachment ? "#fffaf0" : "#fffdf5") : isPropertiesTarget ? "#faf5ff" : isPinned ? "#faf5ff" : isAttachment ? "#fcfcfd" : "white",
        boxShadow: isActive
          ? "0 2px 6px rgba(15,23,42,0.05)"
          : isSelected
            ? "0 0 0 1px rgba(245,158,11,0.45) inset, 0 2px 10px rgba(15,23,42,0.08)"
            : isPropertiesTarget || isPinned
              ? "0 0 0 1px rgba(124,58,237,0.22) inset, 0 2px 10px rgba(124,58,237,0.08)"
              : "0 2px 6px rgba(15,23,42,0.05)",
        position: "relative",
        overflow: "hidden",
      }}
      data-testid={`canvas-node-card-${data.nodeId}`}
      data-codemation-node-id={data.nodeId}
      data-codemation-properties-target={isPropertiesTarget ? "true" : "false"}
      data-codemation-node-status={data.status ?? "pending"}
      data-codemation-node-role={data.role ?? "workflowNode"}
      aria-label={`${data.label} (${data.status ?? "pending"})`}
    >
      <div
        style={{
          width: isAttachment ? 24 : 26,
          height: isAttachment ? 24 : 26,
          borderRadius: 0,
          background: isAttachment ? "#f1f5f9" : "#f8fafc",
          display: "grid",
          placeItems: "center",
          color: "#111827",
          flex: "0 0 auto",
        }}
      >
        <TypeIcon size={isAttachment ? 14 : 15} strokeWidth={1.9} />
      </div>
      <div style={{ minWidth: 0, flex: "1 1 auto", textAlign: "left" }}>
        <div
          style={{
            fontWeight: 800,
            fontSize: isAttachment ? 12 : 13,
            lineHeight: 1.2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: isAttachment ? 2 : 2,
            WebkitBoxOrient: "vertical",
          }}
        >
          {data.label}
        </div>
      </div>
      {trailingIconForNode({ status: data.status, isPinned }) ? (
        <div
          data-testid={`canvas-node-trailing-icon-${data.nodeId}`}
          data-icon-kind={trailingIconKindForNode({ status: data.status, isPinned })}
          style={{ flex: "0 0 auto", display: "grid", placeItems: "center", color: "#111827" }}
        >
          {trailingIconForNode({ status: data.status, isPinned })}
        </div>
      ) : null}
    </div>
  );
}
