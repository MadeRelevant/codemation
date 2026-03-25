import { type CSSProperties, useEffect, useRef, useState } from "react";

import type { WorkflowCanvasNodeData } from "./lib/workflowCanvasNodeData";
import { iconForNode } from "./workflowCanvasNodeChrome";
import { WorkflowCanvasCodemationNodeAccents } from "./WorkflowCanvasCodemationNodeAccents";
import { WorkflowCanvasCodemationNodeAgentLabels } from "./WorkflowCanvasCodemationNodeAgentLabels";
import { WorkflowCanvasCodemationNodeCard } from "./WorkflowCanvasCodemationNodeCard";
import { WorkflowCanvasCodemationNodeHandles } from "./WorkflowCanvasCodemationNodeHandles";
import { WorkflowCanvasCodemationNodeToolbar } from "./WorkflowCanvasCodemationNodeToolbar";

export function CodemationNode({ data }: { data: WorkflowCanvasNodeData }) {
  const TypeIcon = iconForNode(data.type, data.role, data.icon);
  const isQueued = data.status === "queued";
  const isRunning = data.status === "running";
  const isActive = isQueued || isRunning;
  const isSelected = data.selected;
  const isPropertiesTarget = data.propertiesTarget;
  const isAttachment = data.isAttachment;
  const isAgent = data.role === "agent";
  const isPinned = data.isPinned;
  const [isHovered, setIsHovered] = useState(false);
  const [hasToolbarFocus, setHasToolbarFocus] = useState(false);
  const hideToolbarTimeoutRef = useRef<number | null>(null);
  const showsCanvasControls = data.isLiveWorkflowView && !isAttachment;
  const isToolbarVisible = showsCanvasControls && (isHovered || hasToolbarFocus);
  const activityColor = isRunning ? "#2563eb" : "#7c3aed";
  const activityRingStyle: CSSProperties = {
    position: "absolute",
    inset: -4,
    borderRadius: 12,
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
        width: isAttachment ? 144 : 196,
        height: 72,
        borderRadius: 8,
        background: "transparent",
        boxShadow: "none",
        position: "relative",
        overflow: "visible",
      }}
      data-testid={`canvas-node-shell-${data.nodeId}`}
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
        isAgent={isAgent}
        isAttachment={isAttachment}
        sourceOutputPorts={data.sourceOutputPorts}
        targetInputPorts={data.targetInputPorts}
      />
      <WorkflowCanvasCodemationNodeCard TypeIcon={TypeIcon} data={data} />
      {showsCanvasControls ? (
        <WorkflowCanvasCodemationNodeToolbar
          data={data}
          isPinned={isPinned}
          isToolbarVisible={isToolbarVisible}
          setHasToolbarFocus={setHasToolbarFocus}
        />
      ) : null}
      {isAgent ? <WorkflowCanvasCodemationNodeAgentLabels /> : null}
    </div>
  );
}
