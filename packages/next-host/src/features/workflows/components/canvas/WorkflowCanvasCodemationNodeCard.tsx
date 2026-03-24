import { AlertCircle, RefreshCw, ShieldAlert, type LucideIcon } from "lucide-react";

import type { WorkflowCanvasNodeData } from "./lib/workflowCanvasNodeData";
import { CanvasNodeChromeTooltip } from "./CanvasNodeChromeTooltip";
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
      onClick={(event) => {
        event.stopPropagation();
        data.onSelectNode(data.nodeId);
        data.onOpenPropertiesNode(data.nodeId);
      }}
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
        overflow: "visible",
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
        {!isAttachment && (data.retryPolicySummary || data.hasNodeErrorHandler) ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4, alignItems: "center" }}>
            {data.retryPolicySummary ? (
              <CanvasNodeChromeTooltip
                testId={`canvas-node-policy-retry-${data.nodeId}`}
                ariaLabel="Retry policy"
                tooltip={data.retryPolicySummary}
              >
                <span
                  data-testid={`canvas-node-policy-retry-icon-${data.nodeId}`}
                  className="inline-flex h-5 w-5 items-center justify-center rounded border border-teal-200 bg-teal-50 text-teal-700"
                >
                  <RefreshCw size={11} strokeWidth={2.2} />
                </span>
              </CanvasNodeChromeTooltip>
            ) : null}
            {data.hasNodeErrorHandler ? (
              <CanvasNodeChromeTooltip
                testId={`canvas-node-policy-error-handler-${data.nodeId}`}
                ariaLabel="Node error handler"
                tooltip="Node error handler configured"
              >
                <span
                  data-testid={`canvas-node-policy-error-handler-icon-${data.nodeId}`}
                  className="inline-flex h-5 w-5 items-center justify-center rounded border border-violet-200 bg-violet-50 text-violet-700"
                >
                  <ShieldAlert size={11} strokeWidth={2.2} />
                </span>
              </CanvasNodeChromeTooltip>
            ) : null}
          </div>
        ) : null}
      </div>
      {data.credentialAttentionTooltip || trailingIconForNode({ status: data.status, isPinned }) ? (
        <div style={{ flex: "0 0 auto", display: "flex", flexDirection: "row", alignItems: "center", gap: 4 }}>
          {data.credentialAttentionTooltip ? (
            <CanvasNodeChromeTooltip
              testId={`canvas-node-credential-attention-${data.nodeId}`}
              ariaLabel="Credential required"
              tooltip={data.credentialAttentionTooltip}
            >
              <span
                data-testid={`canvas-node-credential-attention-icon-${data.nodeId}`}
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-amber-300 bg-amber-50 text-amber-900"
              >
                <AlertCircle size={12} strokeWidth={2.2} />
              </span>
            </CanvasNodeChromeTooltip>
          ) : null}
          {trailingIconForNode({ status: data.status, isPinned }) ? (
            <div
              data-testid={`canvas-node-trailing-icon-${data.nodeId}`}
              data-icon-kind={trailingIconKindForNode({ status: data.status, isPinned })}
              style={{ display: "grid", placeItems: "center", color: "#111827" }}
            >
              {trailingIconForNode({ status: data.status, isPinned })}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
