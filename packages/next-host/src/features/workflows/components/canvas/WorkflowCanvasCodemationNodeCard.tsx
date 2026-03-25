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
        padding: isAttachment ? "6px 10px" : "8px 12px",
        borderRadius: 8,
        border: isActive
          ? "1px solid transparent"
          : isPinned
            ? "1px solid #6d28d9"
            : isSelected
              ? "1px solid #111827"
              : isPropertiesTarget
                ? "1px solid #7c3aed"
                : "1px solid #e2e8f0",
        background: isSelected ? (isAttachment ? "#fffaf0" : "#fffdf5") : isPropertiesTarget ? "#faf5ff" : isPinned ? "#f5f3ff" : isAttachment ? "#f8fafc" : "#ffffff",
        boxShadow: isActive
          ? "0 1px 2px rgba(15,23,42,0.06), 0 4px 14px rgba(15,23,42,0.06)"
          : isSelected
            ? "0 0 0 1px rgba(245,158,11,0.4) inset, 0 4px 16px rgba(15,23,42,0.1)"
            : isPropertiesTarget || isPinned
              ? "0 0 0 1px rgba(124,58,237,0.18) inset, 0 4px 14px rgba(91,33,182,0.08)"
              : "0 1px 2px rgba(15,23,42,0.05), 0 3px 10px rgba(15,23,42,0.06)",
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
          borderRadius: 7,
          background: isAttachment ? "#eef2f7" : "#f1f5f9",
          display: "grid",
          placeItems: "center",
          color: "#0f172a",
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
            lineHeight: 1.28,
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
