import { type CSSProperties, useEffect, useRef, useState } from "react";

import type { WorkflowCanvasNodeData } from "./lib/workflowCanvasNodeData";
import {
  WORKFLOW_CANVAS_AGENT_NODE_CARD_WIDTH_PX,
  WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX,
  WORKFLOW_CANVAS_MAIN_NODE_CARD_PX,
  WORKFLOW_CANVAS_MAIN_NODE_LABEL_GAP_PX,
  WorkflowCanvasNodeGeometry,
} from "./lib/workflowCanvasNodeGeometry";
import { WorkflowCanvasCodemationNodeAccents } from "./WorkflowCanvasCodemationNodeAccents";
import { WorkflowCanvasCodemationNodeAgentLabels } from "./WorkflowCanvasCodemationNodeAgentLabels";
import { WorkflowCanvasCodemationNodeCard } from "./WorkflowCanvasCodemationNodeCard";
import { WorkflowCanvasCodemationNodeAgentBottomSourceHandles } from "./WorkflowCanvasCodemationNodeAgentBottomSourceHandles";
import { WorkflowCanvasCodemationNodeHandles } from "./WorkflowCanvasCodemationNodeHandles";
import { WorkflowCanvasCodemationNodeLabelBelow } from "./WorkflowCanvasCodemationNodeLabelBelow";
import { WorkflowCanvasCodemationNodeToolbar } from "./WorkflowCanvasCodemationNodeToolbar";

export function CodemationNode({ data }: { data: WorkflowCanvasNodeData }) {
  const isQueued = data.status === "queued";
  const isRunning = data.status === "running";
  const isActive = isQueued || isRunning;
  const isSelected = data.selected;
  const isPropertiesTarget = data.propertiesTarget;
  const isAttachment = data.isAttachment;
  const isNestedAgent = data.role === "nestedAgent";
  const isAgent = data.role === "agent";
  const isPinned = data.isPinned;
  const [isHovered, setIsHovered] = useState(false);
  const [hasToolbarFocus, setHasToolbarFocus] = useState(false);
  const hideToolbarTimeoutRef = useRef<number | null>(null);
  const showsCanvasControls = data.isLiveWorkflowView && !isAttachment;
  const isToolbarVisible = showsCanvasControls && (isHovered || hasToolbarFocus);
  const activityColor = isRunning ? "#2563eb" : "#7c3aed";
  const cardHeightPx =
    isAttachment && !isNestedAgent ? WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX : WORKFLOW_CANVAS_MAIN_NODE_CARD_PX;
  const cardWidthPx =
    isAttachment && !isNestedAgent
      ? WORKFLOW_CANVAS_ATTACHMENT_NODE_CARD_PX
      : isAgent || isNestedAgent
        ? WORKFLOW_CANVAS_AGENT_NODE_CARD_WIDTH_PX
        : WORKFLOW_CANVAS_MAIN_NODE_CARD_PX;
  const fallbackWidthPx =
    isAttachment && !isNestedAgent
      ? WorkflowCanvasNodeGeometry.attachmentNodeWidthPx()
      : WorkflowCanvasNodeGeometry.mainNodeWidthPx(isAgent || isNestedAgent);
  const fallbackHeightPx =
    isAttachment && !isNestedAgent
      ? WorkflowCanvasNodeGeometry.attachmentNodeHeightPx(data.label)
      : WorkflowCanvasNodeGeometry.mainNodeHeightPx(data.label, isAgent || isNestedAgent);
  const nodeWidthPx = data.layoutWidthPx > 0 ? data.layoutWidthPx : fallbackWidthPx;
  const nodeHeightPx = data.layoutHeightPx > 0 ? data.layoutHeightPx : fallbackHeightPx;
  const attachmentSourceOffsetFromNodeBottomPx = Math.max(0, Math.round(nodeHeightPx - cardHeightPx));
  const activityRingStyle: CSSProperties = {
    position: "absolute",
    inset: -4,
    borderRadius: 9,
    pointerEvents: "none",
    opacity: isRunning ? 1 : 0.75,
    padding: 2,
    background: `conic-gradient(from var(--codemation-node-ring-angle), ${activityColor} 0deg, ${activityColor} 72deg, ${activityColor}22 132deg, ${activityColor}1f 228deg, ${activityColor} 324deg, ${activityColor} 360deg)`,
    animation: isRunning
      ? "codemationNodeRingRotate 1.5s linear infinite"
      : "codemationNodeRingRotate 4.5s linear infinite",
    WebkitMask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
    WebkitMaskComposite: "xor",
    maskComposite: "exclude",
    ["--codemation-node-ring-angle" as string]: "0deg",
  };
  useEffect(() => {
    return () => {
      if (hideToolbarTimeoutRef.current !== null) {
        window.clearTimeout(hideToolbarTimeoutRef.current);
      }
    };
  }, []);
  return (
    <div
      onPointerEnter={() => {
        if (hideToolbarTimeoutRef.current !== null) {
          window.clearTimeout(hideToolbarTimeoutRef.current);
          hideToolbarTimeoutRef.current = null;
        }
        setIsHovered(true);
      }}
      onPointerLeave={() => {
        if (hideToolbarTimeoutRef.current !== null) {
          window.clearTimeout(hideToolbarTimeoutRef.current);
        }
        hideToolbarTimeoutRef.current = window.setTimeout(() => {
          setIsHovered(false);
          hideToolbarTimeoutRef.current = null;
        }, 140);
      }}
      onFocusCapture={() => {
        if (hideToolbarTimeoutRef.current !== null) {
          window.clearTimeout(hideToolbarTimeoutRef.current);
          hideToolbarTimeoutRef.current = null;
        }
        setHasToolbarFocus(true);
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          if (hideToolbarTimeoutRef.current !== null) {
            window.clearTimeout(hideToolbarTimeoutRef.current);
          }
          hideToolbarTimeoutRef.current = window.setTimeout(() => {
            setHasToolbarFocus(false);
            hideToolbarTimeoutRef.current = null;
          }, 140);
        }
      }}
      style={{
        width: nodeWidthPx,
        height: nodeHeightPx,
        borderRadius: 0,
        background: "transparent",
        boxShadow: "none",
        position: "relative",
        overflow: "visible",
      }}
      data-testid={`canvas-node-shell-${data.nodeId}`}
    >
      <div
        onClick={(event) => {
          event.stopPropagation();
          data.onSelectNode(data.nodeId);
          data.onOpenPropertiesNode(data.nodeId);
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          width: nodeWidthPx,
        }}
      >
        <div
          style={{
            position: "relative",
            width: cardWidthPx,
            height: cardHeightPx,
            borderRadius: 7,
          }}
        >
          <WorkflowCanvasCodemationNodeAccents
            activityColor={activityColor}
            activityRingStyle={activityRingStyle}
            isActive={isActive}
            isActiveForProperties={isActive}
            isActiveForSelected={isActive}
            isPropertiesTarget={isPropertiesTarget}
            isRunning={isRunning}
            isSelected={isSelected}
          />
          <WorkflowCanvasCodemationNodeHandles
            kind={data.kind}
            isNestedAgentAttachment={isNestedAgent}
            isAgent={isAgent}
            isAttachment={isAttachment && !isNestedAgent}
            omitAgentBottomSourceHandles={isAgent && !isAttachment}
            sourceOutputPorts={data.sourceOutputPorts}
            targetInputPorts={data.targetInputPorts}
          />
          <WorkflowCanvasCodemationNodeCard cardWidthPx={cardWidthPx} cardHeightPx={cardHeightPx} data={data} />
        </div>
        {(isAgent && !isAttachment) || isNestedAgent ? (
          <div style={{ marginTop: WORKFLOW_CANVAS_MAIN_NODE_LABEL_GAP_PX, width: "100%" }}>
            <WorkflowCanvasCodemationNodeAgentLabels />
          </div>
        ) : null}
        <WorkflowCanvasCodemationNodeLabelBelow data={data} maxWidthPx={cardWidthPx} />
      </div>
      {(isAgent && !isAttachment) || isNestedAgent ? (
        <WorkflowCanvasCodemationNodeAgentBottomSourceHandles
          offsetFromNodeBottomPx={attachmentSourceOffsetFromNodeBottomPx}
        />
      ) : null}
      {showsCanvasControls ? (
        <WorkflowCanvasCodemationNodeToolbar
          data={data}
          isPinned={isPinned}
          isToolbarVisible={isToolbarVisible}
          setHasToolbarFocus={setHasToolbarFocus}
        />
      ) : null}
    </div>
  );
}
