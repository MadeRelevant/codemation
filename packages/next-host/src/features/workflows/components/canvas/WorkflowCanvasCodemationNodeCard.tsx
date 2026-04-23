import { AlertCircle, FastForward, RefreshCw, ShieldAlert } from "lucide-react";

import type { WorkflowCanvasNodeData } from "./lib/workflowCanvasNodeData";
import {
  WORKFLOW_CANVAS_ATTACHMENT_NODE_ICON_PX,
  WORKFLOW_CANVAS_MAIN_NODE_ICON_PX,
} from "./lib/workflowCanvasNodeGeometry";
import { CanvasNodeChromeTooltip } from "./CanvasNodeChromeTooltip";
import { trailingIconForNode, trailingIconKindForNode } from "./workflowCanvasNodeChrome";
import { WorkflowCanvasCodemationNodeMainGlyph } from "./WorkflowCanvasCodemationNodeMainGlyph";

/** Unified glyph size so policy badges (retry / continue / error) match visually. */
const POLICY_BADGE_ICON_PX = 10;

export function WorkflowCanvasCodemationNodeCard(
  props: Readonly<{ data: WorkflowCanvasNodeData; cardWidthPx: number; cardHeightPx: number }>,
) {
  const { cardHeightPx, cardWidthPx, data } = props;
  const isAttachment = data.isAttachment;
  const isNestedAgent = data.role === "nestedAgent";
  const treatAsSmallAttachment = isAttachment && !isNestedAgent;
  const isAgentInlineTitle = (!isAttachment && data.role === "agent") || isNestedAgent;
  const isActive = data.status === "queued" || data.status === "running";
  const isSelected = data.selected;
  const isPropertiesTarget = data.propertiesTarget;
  const isPinned = data.isPinned;
  const iconPx = treatAsSmallAttachment ? WORKFLOW_CANVAS_ATTACHMENT_NODE_ICON_PX : WORKFLOW_CANVAS_MAIN_NODE_ICON_PX;
  const trailing = trailingIconForNode({ status: data.status, isPinned });
  const hasTopBadges =
    Boolean(data.retryPolicySummary) ||
    Boolean(data.hasNodeErrorHandler) ||
    Boolean(data.continueWhenEmptyOutput) ||
    Boolean(data.credentialAttentionTooltip) ||
    Boolean(trailing);
  return (
    <div
      style={{
        position: "relative",
        width: cardWidthPx,
        height: cardHeightPx,
        borderRadius: 7,
        overflow: "visible",
        boxSizing: "border-box",
      }}
      data-testid={`canvas-node-card-${data.nodeId}`}
      data-codemation-node-id={data.nodeId}
      data-codemation-properties-target={isPropertiesTarget ? "true" : "false"}
      data-codemation-node-status={data.status ?? "pending"}
      data-codemation-node-role={data.role ?? "workflowNode"}
      data-codemation-node-pinned={isPinned ? "true" : "false"}
      aria-label={`${data.label} (${data.status ?? "pending"})`}
    >
      <div
        style={{
          position: "relative",
          borderRadius: 7,
          overflow: "hidden",
          height: "100%",
          width: "100%",
          border: isActive
            ? "1px solid transparent"
            : isPinned
              ? "1px solid #6d28d9"
              : isSelected
                ? "1px solid #111827"
                : isPropertiesTarget
                  ? "1px solid #7c3aed"
                  : "1px solid #e2e8f0",
          background: isSelected
            ? treatAsSmallAttachment
              ? "#fffaf0"
              : "#fffdf5"
            : isPropertiesTarget
              ? "#faf5ff"
              : isPinned
                ? "#f5f3ff"
                : treatAsSmallAttachment
                  ? "#f8fafc"
                  : "#ffffff",
          boxShadow: isActive
            ? "0 1px 2px rgba(15,23,42,0.06), 0 4px 14px rgba(15,23,42,0.06)"
            : isSelected
              ? "0 0 0 1px rgba(245,158,11,0.4) inset, 0 4px 16px rgba(15,23,42,0.1)"
              : isPropertiesTarget || isPinned
                ? "0 0 0 1px rgba(124,58,237,0.18) inset, 0 4px 14px rgba(91,33,182,0.08)"
                : "0 1px 2px rgba(15,23,42,0.05), 0 3px 10px rgba(15,23,42,0.06)",
        }}
      >
        <WorkflowCanvasCodemationNodeMainGlyph data={data} iconPx={iconPx} isAgentInlineTitle={isAgentInlineTitle} />

        {hasTopBadges ? (
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              display: "flex",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              paddingLeft: 5,
              paddingRight: 5,
              paddingTop: 5,
              gap: 4,
              zIndex: 2,
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "flex-start",
                alignItems: "center",
                gap: 4,
                minHeight: 0,
                pointerEvents: "auto",
              }}
            >
              {data.retryPolicySummary ? (
                <CanvasNodeChromeTooltip
                  testId={`canvas-node-policy-retry-${data.nodeId}`}
                  ariaLabel="Retry policy"
                  tooltip={data.retryPolicySummary}
                >
                  <span
                    data-testid={`canvas-node-policy-retry-icon-${data.nodeId}`}
                    className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded border border-teal-200 bg-teal-50 text-teal-700"
                  >
                    <RefreshCw size={POLICY_BADGE_ICON_PX} strokeWidth={2.1} />
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
                    className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded border border-violet-200 bg-violet-50 text-violet-700"
                  >
                    <ShieldAlert size={POLICY_BADGE_ICON_PX} strokeWidth={2.1} />
                  </span>
                </CanvasNodeChromeTooltip>
              ) : null}
              {data.continueWhenEmptyOutput ? (
                <CanvasNodeChromeTooltip
                  testId={`canvas-node-policy-continue-empty-${data.nodeId}`}
                  ariaLabel="Continue when empty"
                  tooltip="Downstream continues even when this node emits no items on main output."
                >
                  <span
                    data-testid={`canvas-node-continue-empty-icon-${data.nodeId}`}
                    className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded border border-sky-200 bg-sky-50 text-sky-800"
                  >
                    <FastForward size={POLICY_BADGE_ICON_PX} strokeWidth={2.1} />
                  </span>
                </CanvasNodeChromeTooltip>
              ) : null}
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                flexWrap: "wrap",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 4,
                pointerEvents: "auto",
              }}
            >
              {data.credentialAttentionTooltip ? (
                <CanvasNodeChromeTooltip
                  testId={`canvas-node-credential-attention-${data.nodeId}`}
                  ariaLabel="Credential required"
                  tooltip={data.credentialAttentionTooltip}
                >
                  <span
                    data-testid={`canvas-node-credential-attention-icon-${data.nodeId}`}
                    className="inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded border border-amber-300 bg-amber-50 text-amber-900"
                  >
                    <AlertCircle size={POLICY_BADGE_ICON_PX} strokeWidth={2.1} />
                  </span>
                </CanvasNodeChromeTooltip>
              ) : null}
              {trailing ? (
                <div
                  data-testid={`canvas-node-trailing-icon-${data.nodeId}`}
                  data-icon-kind={trailingIconKindForNode({ status: data.status, isPinned })}
                  style={{ display: "grid", placeItems: "center", color: "#111827" }}
                >
                  {trailing}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
