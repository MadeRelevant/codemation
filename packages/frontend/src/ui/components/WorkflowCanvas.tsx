"use client";

import dagre from "dagre";
import { Bot, Boxes, Brain, CircleAlert, CircleCheckBig, Clock3, GitBranch, Globe, type LucideIcon, Pencil, Pin, PinOff, Play, PlaySquare, SquareStack, Workflow, Wrench } from "lucide-react";
import { AgentAttachmentNodeIdFactory } from "@codemation/core";
import {
  Background,
  BaseEdge,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getStraightPath,
  type Edge as ReactFlowEdge,
  type EdgeProps as ReactFlowEdgeProps,
  type Node as ReactFlowNode,
  type ReactFlowInstance,
} from "@xyflow/react";
import { type CSSProperties, type MouseEvent, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NodeExecutionSnapshot } from "../realtime/realtime";
import type { WorkflowDto } from "../realtime/workflowTypes";

type NodeData = Readonly<{
  nodeId: string;
  label: string;
  type: string;
  kind: string;
  role?: string;
  icon?: string;
  status?: NodeExecutionSnapshot["status"];
  selected: boolean;
  isAttachment: boolean;
  isPinned: boolean;
  hasOutputData: boolean;
  isLiveWorkflowView: boolean;
  isRunning: boolean;
  onSelectNode: (nodeId: string) => void;
  onRunNode: (nodeId: string) => void;
  onTogglePinnedOutput: (nodeId: string) => void;
  onEditNodeOutput: (nodeId: string) => void;
  onClearPinnedOutput: (nodeId: string) => void;
}>;

const workflowCanvasNodeTypes = { codemation: CodemationNode };
const workflowCanvasEdgeTypes = { straightCount: StraightCountEdge };

class WorkflowCanvasEdgeStyleResolver {
  private static readonly activeMainStroke = "#111827";
  private static readonly activeAttachmentStroke = "#94a3b8";
  private static readonly inactiveMainStroke = "#9ca3af";
  private static readonly inactiveAttachmentStroke = "#cbd5e1";
  private static readonly activeMainLabelFill = "#111827";
  private static readonly activeAttachmentLabelFill = "#475569";
  private static readonly inactiveMainLabelFill = "#6b7280";
  private static readonly inactiveAttachmentLabelFill = "#94a3b8";
  private static readonly activeMainLabelBackground = "rgba(255,253,245,0.96)";
  private static readonly activeAttachmentLabelBackground = "rgba(248,250,252,0.92)";
  private static readonly inactiveMainLabelBackground = "rgba(249,250,251,0.96)";
  private static readonly inactiveAttachmentLabelBackground = "rgba(248,250,252,0.72)";

  static resolveStrokeColor(args: Readonly<{ edgeItemCount: number; isAttachmentEdge: boolean }>): string {
    if (args.edgeItemCount > 0) {
      return args.isAttachmentEdge ? this.activeAttachmentStroke : this.activeMainStroke;
    }
    return args.isAttachmentEdge ? this.inactiveAttachmentStroke : this.inactiveMainStroke;
  }

  static resolveLabelFill(args: Readonly<{ edgeItemCount: number; isAttachmentEdge: boolean }>): string {
    if (args.edgeItemCount > 0) {
      return args.isAttachmentEdge ? this.activeAttachmentLabelFill : this.activeMainLabelFill;
    }
    return args.isAttachmentEdge ? this.inactiveAttachmentLabelFill : this.inactiveMainLabelFill;
  }

  static resolveLabelBackground(args: Readonly<{ edgeItemCount: number; isAttachmentEdge: boolean }>): string {
    if (args.edgeItemCount > 0) {
      return args.isAttachmentEdge ? this.activeAttachmentLabelBackground : this.activeMainLabelBackground;
    }
    return args.isAttachmentEdge ? this.inactiveAttachmentLabelBackground : this.inactiveMainLabelBackground;
  }
}

class VisibleNodeStatusResolver {
  private static readonly statusPriorityByStatus = new Map<NodeExecutionSnapshot["status"], number>([
    ["running", 0],
    ["queued", 1],
    ["completed", 2],
    ["failed", 3],
    ["skipped", 4],
    ["pending", 5],
  ]);

  static resolveStatuses(
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>,
  ): Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>> {
    const snapshotsByVisibleNodeId = new Map<string, NodeExecutionSnapshot[]>();
    for (const [nodeId, snapshot] of Object.entries(nodeSnapshotsByNodeId)) {
      const visibleNodeId = this.resolveVisibleNodeId(nodeId);
      const snapshots = snapshotsByVisibleNodeId.get(visibleNodeId) ?? [];
      snapshots.push(snapshot);
      snapshotsByVisibleNodeId.set(visibleNodeId, snapshots);
    }

    const statusEntries: Array<readonly [string, NodeExecutionSnapshot["status"]]> = [];
    for (const [visibleNodeId, snapshots] of snapshotsByVisibleNodeId.entries()) {
      const resolvedSnapshot = [...snapshots].sort((left, right) => this.compareSnapshots(left, right))[0];
      if (resolvedSnapshot) {
        statusEntries.push([visibleNodeId, resolvedSnapshot.status] as const);
      }
    }
    return Object.fromEntries(statusEntries);
  }

  private static resolveVisibleNodeId(nodeId: string): string {
    const languageModelNodeId = AgentAttachmentNodeIdFactory.getBaseLanguageModelNodeId(nodeId);
    if (languageModelNodeId !== nodeId) return languageModelNodeId;
    return AgentAttachmentNodeIdFactory.getBaseToolNodeId(nodeId);
  }

  private static compareSnapshots(left: NodeExecutionSnapshot, right: NodeExecutionSnapshot): number {
    const statusPriorityComparison = this.getStatusPriority(left.status) - this.getStatusPriority(right.status);
    if (statusPriorityComparison !== 0) return statusPriorityComparison;
    return (right.updatedAt ?? "").localeCompare(left.updatedAt ?? "");
  }

  private static getStatusPriority(status: NodeExecutionSnapshot["status"]): number {
    return this.statusPriorityByStatus.get(status) ?? Number.MAX_SAFE_INTEGER;
  }
}

export class WorkflowCanvasEdgeCountResolver {
  static resolveCount(args: Readonly<{
    targetNodeId: string;
    targetNodeRole: string | undefined;
    targetInput: string;
    sourceOutput: string;
    sourceSnapshot: NodeExecutionSnapshot | undefined;
    targetSnapshot: NodeExecutionSnapshot | undefined;
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
  }>): number {
    if (args.targetNodeRole === "languageModel" || args.targetNodeRole === "tool") {
      const attachmentInvocationCount = this.resolveAttachmentInvocationCount(args.targetNodeId, args.targetNodeRole, args.nodeSnapshotsByNodeId);
      if (attachmentInvocationCount > 0) return attachmentInvocationCount;
    }

    const targetInputItems = args.targetSnapshot?.inputsByPort?.[args.targetInput];
    const sourceOutputItems = args.sourceSnapshot?.outputs?.[args.sourceOutput];
    return targetInputItems?.length ?? sourceOutputItems?.length ?? 0;
  }

  private static resolveAttachmentInvocationCount(
    targetNodeId: string,
    targetNodeRole: string,
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>,
  ): number {
    return Object.values(nodeSnapshotsByNodeId).filter((snapshot) => {
      if (targetNodeRole === "languageModel") {
        return AgentAttachmentNodeIdFactory.getBaseLanguageModelNodeId(snapshot.nodeId) === targetNodeId;
      }
      if (targetNodeRole === "tool") {
        return AgentAttachmentNodeIdFactory.getBaseToolNodeId(snapshot.nodeId) === targetNodeId;
      }
      return false;
    }).length;
  }
}

function StraightCountEdge(props: ReactFlowEdgeProps<ReactFlowEdge>) {
  const [edgePath, labelX, labelY] = getStraightPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
  });
  return (
    <BaseEdge
      id={props.id}
      path={edgePath}
      markerEnd={props.markerEnd}
      markerStart={props.markerStart}
      style={props.style}
      label={props.label}
      labelX={labelX}
      labelY={labelY + 16}
      labelStyle={props.labelStyle}
      labelShowBg
      labelBgStyle={props.labelBgStyle}
      labelBgPadding={props.labelBgPadding}
      labelBgBorderRadius={props.labelBgBorderRadius}
      interactionWidth={props.interactionWidth}
    />
  );
}

function useVisibleNodeStatuses(
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>,
): Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>> {
  return useMemo(() => VisibleNodeStatusResolver.resolveStatuses(nodeSnapshotsByNodeId), [nodeSnapshotsByNodeId]);
}

function iconForNode(type: string, role?: string, icon?: string): LucideIcon {
  const explicitIcon = icon?.toLowerCase();
  if (explicitIcon === "globe") {
    return Globe;
  }
  if (role === "agent") {
    return Bot;
  }
  if (role === "languageModel") {
    return Brain;
  }
  if (role === "tool") {
    return Wrench;
  }

  const t = type.toLowerCase();

  if (t.includes("if")) {
    return GitBranch;
  }
  if (t.includes("subworkflow")) {
    return Workflow;
  }
  if (t.includes("map")) {
    return SquareStack;
  }
  if (t.includes("trigger")) {
    return PlaySquare;
  }
  if (t.includes("agent") || t.includes("ai")) {
    return Bot;
  }

  return Boxes;
}

function statusIconForNode(status: NodeExecutionSnapshot["status"] | undefined) {
  if (status === "completed") {
    return <CircleCheckBig size={15} style={{ color: "#15803d" }} strokeWidth={2.1} />;
  }
  if (status === "skipped") {
    return <Clock3 size={15} style={{ color: "#d97706" }} strokeWidth={2.1} />;
  }
  if (status === "failed") {
    return <CircleAlert size={15} style={{ color: "#b91c1c" }} strokeWidth={2.1} />;
  }
  if (status === "running" || status === "queued" || status === "pending" || typeof status === "undefined") {
    return null;
  }
  return null;
}

function trailingIconForNode(args: Readonly<{ status: NodeExecutionSnapshot["status"] | undefined; isPinned: boolean }>) {
  if (args.isPinned) {
    return <Pin size={14} style={{ color: "#6d28d9" }} strokeWidth={2.4} fill="currentColor" />;
  }
  return statusIconForNode(args.status);
}

function trailingIconKindForNode(args: Readonly<{ status: NodeExecutionSnapshot["status"] | undefined; isPinned: boolean }>): string {
  if (args.isPinned) {
    return "pin";
  }
  if (args.status === "completed") {
    return "completed";
  }
  if (args.status === "skipped") {
    return "skipped";
  }
  if (args.status === "failed") {
    return "failed";
  }
  return "none";
}

function ToolbarIconButton(args: Readonly<{
  testId: string;
  ariaLabel: string;
  tooltip: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onAfterClick?: () => void;
  disabled?: boolean;
  children: ReactNode;
  accentColor?: string;
}>) {
  const { accentColor = "#111827", ariaLabel, children, disabled = false, onAfterClick, onClick, testId, tooltip } = args;
  const [isTooltipVisible, setIsTooltipVisible] = useState(false);
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    onClick(event);
    event.currentTarget.blur();
    onAfterClick?.();
  };
  return (
    <div
      style={{ position: "relative", display: "grid", placeItems: "center" }}
      onPointerEnter={() => setIsTooltipVisible(true)}
      onPointerLeave={() => setIsTooltipVisible(false)}
      onFocusCapture={() => setIsTooltipVisible(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setIsTooltipVisible(false);
        }
      }}
    >
      <button
        type="button"
        data-testid={testId}
        aria-label={ariaLabel}
        onMouseDown={(event) => {
          if (!disabled) {
            event.preventDefault();
          }
        }}
        onClick={handleClick}
        disabled={disabled}
        style={{
          width: 24,
          height: 24,
          border: "1px solid #d1d5db",
          background: "white",
          color: accentColor,
          display: "grid",
          placeItems: "center",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.45 : 1,
          padding: 0,
          boxShadow: "0 1px 2px rgba(15,23,42,0.05)",
        }}
      >
        {children}
      </button>
      <div
        role="tooltip"
        aria-hidden={!isTooltipVisible}
        style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          left: "50%",
          transform: isTooltipVisible ? "translateX(-50%) translateY(0)" : "translateX(-50%) translateY(3px)",
          opacity: isTooltipVisible ? 1 : 0,
          transition: "opacity 110ms ease-out, transform 110ms ease-out",
          pointerEvents: "none",
          padding: "6px 8px",
          background: "rgba(15,23,42,0.94)",
          color: "white",
          fontSize: 11,
          fontWeight: 700,
          whiteSpace: "nowrap",
          boxShadow: "0 10px 24px rgba(15,23,42,0.2)",
          zIndex: 40,
        }}
      >
        {tooltip}
      </div>
    </div>
  );
}

function CodemationNode({ data }: { data: NodeData }) {
  const TypeIcon = iconForNode(data.type, data.role, data.icon);
  const isQueued = data.status === "queued";
  const isRunning = data.status === "running";
  const isActive = isQueued || isRunning;
  const isSelected = data.selected;
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
    pointerEvents: "none",
    opacity: isRunning ? 1 : 0.75,
    padding: 2,
    background: `conic-gradient(from var(--codemation-node-ring-angle), ${activityColor} 0deg, ${activityColor} 72deg, ${activityColor}22 132deg, ${activityColor}1f 228deg, ${activityColor} 324deg, ${activityColor} 360deg)`,
    animation: isRunning ? "codemationNodeRingRotate 1.5s linear infinite" : "codemationNodeRingRotate 4.5s linear infinite",
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
        height: 54,
        borderRadius: 0,
        background: "transparent",
        boxShadow: "none",
        position: "relative",
        overflow: "visible",
      }}
      data-testid={`canvas-node-shell-${data.nodeId}`}
    >
      {isActive ? (
        <>
          <div
            style={{
              position: "absolute",
              inset: -8,
              borderRadius: 0,
              pointerEvents: "none",
              boxShadow: `0 0 14px ${activityColor}33, 0 0 28px ${activityColor}22`,
              opacity: isRunning ? 0.85 : 0.48,
              animation: isRunning ? "codemationNodeBreath 2.2s ease-in-out infinite" : "none",
            }}
          />
          <div
            aria-hidden
            style={activityRingStyle}
          />
        </>
      ) : null}
      {isSelected ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 4,
            pointerEvents: "none",
            border: "2px dashed #f59e0b",
            boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.85)",
            opacity: isActive ? 0.95 : 1,
          }}
        />
      ) : null}
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

      <div
        onClick={() => data.onSelectNode(data.nodeId)}
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: isAttachment ? 8 : 10,
          height: "100%",
          padding: isAttachment ? "0 10px" : "0 10px",
          borderRadius: 0,
          border: isActive ? "1px solid transparent" : isPinned ? "1px solid #7c3aed" : isSelected ? "1px solid #111827" : "1px solid #d1d5db",
          background: isSelected ? (isAttachment ? "#fffaf0" : "#fffdf5") : isPinned ? "#faf5ff" : isAttachment ? "#fcfcfd" : "white",
          boxShadow: isActive
            ? "0 2px 6px rgba(15,23,42,0.05)"
            : isSelected
              ? "0 0 0 1px rgba(245,158,11,0.45) inset, 0 2px 10px rgba(15,23,42,0.08)"
              : isPinned
                ? "0 0 0 1px rgba(124,58,237,0.22) inset, 0 2px 10px rgba(124,58,237,0.08)"
                : "0 2px 6px rgba(15,23,42,0.05)",
          position: "relative",
          overflow: "hidden",
        }}
        data-testid={`canvas-node-card-${data.nodeId}`}
        data-codemation-node-id={data.nodeId}
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
      {showsCanvasControls ? (
        <div
          data-testid={`canvas-node-toolbar-${data.nodeId}`}
          style={{
            position: "absolute",
            top: -34,
            right: 0,
            display: "flex",
            alignItems: "center",
            gap: 4,
            opacity: isToolbarVisible ? 1 : 0,
            transform: isToolbarVisible ? "translateY(0)" : "translateY(3px)",
            transition: "opacity 90ms ease-out, transform 90ms ease-out",
            pointerEvents: isToolbarVisible ? "auto" : "none",
            padding: 4,
            background: "rgba(255,255,255,0.96)",
            boxShadow: "0 8px 18px rgba(15,23,42,0.12)",
            zIndex: 30,
          }}
        >
          <ToolbarIconButton
            testId={`canvas-node-run-button-${data.nodeId}`}
            ariaLabel={`Run to ${data.label}`}
            tooltip={data.isRunning ? "Run disabled while workflow is running" : "Run from here"}
            onAfterClick={() => setHasToolbarFocus(false)}
            onClick={(event) => {
              event.stopPropagation();
              data.onSelectNode(data.nodeId);
              data.onRunNode(data.nodeId);
            }}
            disabled={data.isRunning}
          >
            <Play size={12} strokeWidth={2.1} />
          </ToolbarIconButton>
          <ToolbarIconButton
            testId={`${isPinned ? "canvas-node-unpin-button" : "canvas-node-pin-button"}-${data.nodeId}`}
            ariaLabel={`${isPinned ? "Unpin" : "Pin"} ${data.label}`}
            tooltip={
              !data.hasOutputData ? "No output to pin yet" : isPinned ? "Unpin output" : "Pin current output"
            }
            onAfterClick={() => setHasToolbarFocus(false)}
            onClick={(event) => {
              event.stopPropagation();
              data.onSelectNode(data.nodeId);
              data.onTogglePinnedOutput(data.nodeId);
            }}
            disabled={!data.hasOutputData}
            accentColor="#6d28d9"
          >
            {isPinned ? <PinOff size={12} strokeWidth={2.3} fill="currentColor" /> : <Pin size={12} strokeWidth={2} />}
          </ToolbarIconButton>
          <ToolbarIconButton
            testId={`canvas-node-edit-button-${data.nodeId}`}
            ariaLabel={`Edit ${data.label}`}
            tooltip="Edit output"
            onAfterClick={() => setHasToolbarFocus(false)}
            onClick={(event) => {
              event.stopPropagation();
              data.onSelectNode(data.nodeId);
              data.onEditNodeOutput(data.nodeId);
            }}
          >
            <Pencil size={12} strokeWidth={2} />
          </ToolbarIconButton>
        </div>
      ) : null}
      {isAgent ? (
        <>
          <div
            style={{
              position: "absolute",
              bottom: -22,
              left: "34%",
              transform: "translateX(-50%)",
              padding: "2px 6px",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.35,
              textTransform: "uppercase",
              color: "#1d4ed8",
              background: "#eff6ff",
              border: "1px dotted #93c5fd",
              whiteSpace: "nowrap",
            }}
          >
            LLM
          </div>
          <div
            style={{
              position: "absolute",
              bottom: -22,
              left: "66%",
              transform: "translateX(-50%)",
              padding: "2px 6px",
              fontSize: 10,
              fontWeight: 800,
              letterSpacing: 0.35,
              textTransform: "uppercase",
              color: "#6d28d9",
              background: "#f5f3ff",
              border: "1px dotted #c4b5fd",
              whiteSpace: "nowrap",
            }}
          >
            Tools
          </div>
        </>
      ) : null}
    </div>
  );
}

function layoutWorkflow(
  workflow: WorkflowDto,
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>,
  nodeStatusesByNodeId: Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>>,
  selectedNodeId: string | null,
  pinnedNodeIds: ReadonlySet<string>,
  isLiveWorkflowView: boolean,
  isRunning: boolean,
  onSelectNode: (nodeId: string) => void,
  onRunNode: (nodeId: string) => void,
  onTogglePinnedOutput: (nodeId: string) => void,
  onEditNodeOutput: (nodeId: string) => void,
  onClearPinnedOutput: (nodeId: string) => void,
): Readonly<{ nodes: ReactFlowNode<NodeData>[]; edges: ReactFlowEdge[] }> {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "LR", ranksep: 72, nodesep: 28, edgesep: 12 });

  const nodeWidth = 196;
  const nodeHeight = 54;
  const attachmentNodeWidth = 144;
  const attachmentNodeHeight = 54;
  const branchSpacing = nodeHeight + 28;
  const attachmentYOffset = 118;
  const attachmentXSpacing = attachmentNodeWidth + 26;
  const layoutNodes = workflow.nodes.filter((node) => !node.parentNodeId);
  const layoutNodeIds = new Set(layoutNodes.map((node) => node.id));
  const layoutEdges = workflow.edges.filter((edge) => layoutNodeIds.has(edge.from.nodeId) && layoutNodeIds.has(edge.to.nodeId));

  for (const node of layoutNodes) {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  }
  for (const [i, edge] of layoutEdges.entries()) {
    dagreGraph.setEdge(edge.from.nodeId, edge.to.nodeId, { i });
  }

  dagre.layout(dagreGraph);

  const positionsByNodeId = new Map<string, { x: number; y: number }>();
  for (const node of layoutNodes) {
    const position = dagreGraph.node(node.id) as { x: number; y: number } | undefined;
    positionsByNodeId.set(node.id, { x: position?.x ?? 0, y: position?.y ?? 0 });
  }

  const outgoingNodeIdsByNodeId = new Map<string, string[]>();
  const incomingNodeIdsByNodeId = new Map<string, string[]>();
  for (const edge of layoutEdges) {
    const outgoing = outgoingNodeIdsByNodeId.get(edge.from.nodeId) ?? [];
    outgoing.push(edge.to.nodeId);
    outgoingNodeIdsByNodeId.set(edge.from.nodeId, outgoing);

    const incoming = incomingNodeIdsByNodeId.get(edge.to.nodeId) ?? [];
    incoming.push(edge.from.nodeId);
    incomingNodeIdsByNodeId.set(edge.to.nodeId, incoming);
  }

  for (const node of layoutNodes) {
    const childNodeIds = outgoingNodeIdsByNodeId.get(node.id) ?? [];
    if (childNodeIds.length < 2) continue;

    const parentPosition = positionsByNodeId.get(node.id);
    if (!parentPosition) continue;

    const orderedChildNodeIds = [...childNodeIds].sort((leftNodeId, rightNodeId) => {
      const leftY = positionsByNodeId.get(leftNodeId)?.y ?? 0;
      const rightY = positionsByNodeId.get(rightNodeId)?.y ?? 0;
      return leftY - rightY;
    });

    orderedChildNodeIds.forEach((childNodeId, index) => {
      const childPosition = positionsByNodeId.get(childNodeId);
      if (!childPosition) return;

      positionsByNodeId.set(childNodeId, {
        x: childPosition.x,
        y: parentPosition.y + (index - (orderedChildNodeIds.length - 1) / 2) * branchSpacing,
      });
    });
  }

  for (const node of layoutNodes) {
    const parentNodeIds = incomingNodeIdsByNodeId.get(node.id) ?? [];
    if (parentNodeIds.length < 2) continue;

    const nodePosition = positionsByNodeId.get(node.id);
    if (!nodePosition) continue;

    const averageParentY =
      parentNodeIds.reduce((sum, parentNodeId) => sum + (positionsByNodeId.get(parentNodeId)?.y ?? nodePosition.y), 0) / parentNodeIds.length;

    positionsByNodeId.set(node.id, {
      x: nodePosition.x,
      y: averageParentY,
    });
  }

  const attachmentNodesByParentNodeId = new Map<string, WorkflowDto["nodes"]>();
  for (const node of workflow.nodes) {
    if (!node.parentNodeId) continue;
    const siblings = attachmentNodesByParentNodeId.get(node.parentNodeId) ?? [];
    attachmentNodesByParentNodeId.set(node.parentNodeId, [...siblings, node]);
  }

  for (const [parentNodeId, attachmentNodes] of attachmentNodesByParentNodeId.entries()) {
    const parentPosition = positionsByNodeId.get(parentNodeId);
    if (!parentPosition) continue;
    const orderedAttachmentNodes = [...attachmentNodes].sort((left, right) => {
      if (left.role === right.role) return left.name?.localeCompare(right.name ?? "") ?? 0;
      if (left.role === "languageModel") return -1;
      if (right.role === "languageModel") return 1;
      return 0;
    });
    orderedAttachmentNodes.forEach((attachmentNode, index) => {
      positionsByNodeId.set(attachmentNode.id, {
        x: parentPosition.x + (index - (attachmentNodes.length - 1) / 2) * attachmentXSpacing,
        y: parentPosition.y + attachmentYOffset,
      });
    });
  }

  const nodes: ReactFlowNode<NodeData>[] = workflow.nodes.map((n) => {
    const pos = positionsByNodeId.get(n.id);
    const label = n.name ?? n.type ?? n.id;
    const resolvedNodeWidth = n.parentNodeId ? attachmentNodeWidth : nodeWidth;
    const resolvedNodeHeight = n.parentNodeId ? attachmentNodeHeight : nodeHeight;
    return {
      id: n.id,
      type: "codemation",
      position: {
        x: (pos?.x ?? 0) - resolvedNodeWidth / 2,
        y: (pos?.y ?? 0) - resolvedNodeHeight / 2,
      },
      width: resolvedNodeWidth,
      height: resolvedNodeHeight,
      initialWidth: resolvedNodeWidth,
      initialHeight: resolvedNodeHeight,
      data: {
        nodeId: n.id,
        label,
        type: n.type,
        kind: n.kind,
        role: n.role,
        icon: n.icon,
        status: nodeStatusesByNodeId[n.id],
        selected: selectedNodeId === n.id,
        isAttachment: Boolean(n.parentNodeId),
        isPinned: pinnedNodeIds.has(n.id),
        hasOutputData: Boolean(pinnedNodeIds.has(n.id) || nodeSnapshotsByNodeId[n.id]?.outputs?.main),
        isLiveWorkflowView,
        isRunning,
        onSelectNode,
        onRunNode,
        onTogglePinnedOutput,
        onEditNodeOutput,
        onClearPinnedOutput,
      },
      draggable: false,
      sourcePosition: n.parentNodeId ? Position.Bottom : Position.Right,
      targetPosition: n.parentNodeId ? Position.Top : Position.Left,
    };
  });

  const nodesById = new Map(workflow.nodes.map((node) => [node.id, node]));
  const edges: ReactFlowEdge[] = workflow.edges.map((e, i) => {
    const targetNode = nodesById.get(e.to.nodeId);
    const isAttachmentEdge = targetNode?.role === "languageModel" || targetNode?.role === "tool";
    const attachmentSourceHandle =
      targetNode?.role === "languageModel" ? "attachment-llm-source" : targetNode?.role === "tool" ? "attachment-tools-source" : undefined;
    const sourcePosition = positionsByNodeId.get(e.from.nodeId);
    const targetPosition = positionsByNodeId.get(e.to.nodeId);
    const isStraightMainEdge = !isAttachmentEdge && Math.abs((sourcePosition?.y ?? 0) - (targetPosition?.y ?? 0)) < 1;
    const targetSnapshot = nodeSnapshotsByNodeId[e.to.nodeId];
    const sourceSnapshot = nodeSnapshotsByNodeId[e.from.nodeId];
    const edgeItemCount = WorkflowCanvasEdgeCountResolver.resolveCount({
      targetNodeId: e.to.nodeId,
      targetNodeRole: targetNode?.role,
      targetInput: e.to.input,
      sourceOutput: e.from.output,
      sourceSnapshot,
      targetSnapshot,
      nodeSnapshotsByNodeId,
    });
    const edgeLabel = edgeItemCount > 0 ? `${edgeItemCount} item${edgeItemCount === 1 ? "" : "s"}` : undefined;
    const edgeStroke = WorkflowCanvasEdgeStyleResolver.resolveStrokeColor({
      edgeItemCount,
      isAttachmentEdge,
    });
    return {
      id: `${e.from.nodeId}:${e.from.output}->${e.to.nodeId}:${e.to.input}:${i}`,
      source: e.from.nodeId,
      target: e.to.nodeId,
      sourceHandle: isAttachmentEdge ? attachmentSourceHandle : undefined,
      targetHandle: isAttachmentEdge ? "attachment-target" : undefined,
      animated: false,
      type: isAttachmentEdge ? "smoothstep" : isStraightMainEdge ? "straightCount" : "step",
      style: {
        stroke: edgeStroke,
        strokeWidth: isAttachmentEdge ? 1.35 : 1.5,
        strokeDasharray: isAttachmentEdge ? "2 6" : undefined,
        strokeLinecap: isAttachmentEdge ? "round" : undefined,
      },
      label: edgeLabel,
      labelStyle: {
        fill: WorkflowCanvasEdgeStyleResolver.resolveLabelFill({
          edgeItemCount,
          isAttachmentEdge,
        }),
        fontSize: isAttachmentEdge ? 10 : 11,
        fontWeight: 800,
      },
      labelBgStyle: {
        fill: WorkflowCanvasEdgeStyleResolver.resolveLabelBackground({
          edgeItemCount,
          isAttachmentEdge,
        }),
        fillOpacity: 1,
      },
      labelBgPadding: isAttachmentEdge ? [4, 2] : [6, 3],
      labelBgBorderRadius: 0,
      markerEnd: isAttachmentEdge
        ? undefined
        : {
            type: MarkerType.ArrowClosed,
            width: 18,
            height: 18,
            color: edgeStroke,
          },
    };
  });

  return { nodes, edges };
}

export function WorkflowCanvas(args: {
  workflow: WorkflowDto;
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
  selectedNodeId: string | null;
  pinnedNodeIds?: ReadonlySet<string>;
  isLiveWorkflowView: boolean;
  isRunning: boolean;
  onSelectNode: (nodeId: string) => void;
  onRunNode: (nodeId: string) => void;
  onTogglePinnedOutput: (nodeId: string) => void;
  onEditNodeOutput: (nodeId: string) => void;
  onClearPinnedOutput: (nodeId: string) => void;
}) {
  const { workflow, nodeSnapshotsByNodeId, selectedNodeId, pinnedNodeIds = new Set<string>(), isLiveWorkflowView, isRunning, onSelectNode, onRunNode, onTogglePinnedOutput, onEditNodeOutput, onClearPinnedOutput } = args;
  const [hasMountedOnClient, setHasMountedOnClient] = useState(false);
  const [isInitialViewportReady, setIsInitialViewportReady] = useState(false);
  const visibleNodeStatusesByNodeId = useVisibleNodeStatuses(nodeSnapshotsByNodeId);
  const { nodes, edges } = useMemo(
    () =>
      layoutWorkflow(
        workflow,
        nodeSnapshotsByNodeId,
        visibleNodeStatusesByNodeId,
        selectedNodeId,
        pinnedNodeIds,
        isLiveWorkflowView,
        isRunning,
        onSelectNode,
        onRunNode,
        onTogglePinnedOutput,
        onEditNodeOutput,
        onClearPinnedOutput,
      ),
    [isLiveWorkflowView, isRunning, nodeSnapshotsByNodeId, onClearPinnedOutput, onEditNodeOutput, onRunNode, onSelectNode, onTogglePinnedOutput, pinnedNodeIds, selectedNodeId, visibleNodeStatusesByNodeId, workflow],
  );
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const reactFlowInstanceRef = useRef<ReactFlowInstance<ReactFlowNode<NodeData>, ReactFlowEdge> | null>(null);
  const fitViewAnimationFrameIdRef = useRef<number | null>(null);
  const fitViewTimeoutIdRef = useRef<number | null>(null);
  const fitViewRequestIdRef = useRef(0);
  const fitViewOptions = useMemo(
    () =>
      ({
        padding: 0.24,
        minZoom: 0.2,
        maxZoom: 1,
      }) as const,
    [],
  );
  const scheduleFitView = useCallback(() => {
    const canvasContainer = canvasContainerRef.current;
    const reactFlowInstance = reactFlowInstanceRef.current;
    if (!canvasContainer || !reactFlowInstance || nodes.length === 0) {
      return;
    }
    if (canvasContainer.clientWidth === 0 || canvasContainer.clientHeight === 0) {
      return;
    }
    if (fitViewAnimationFrameIdRef.current !== null) {
      cancelAnimationFrame(fitViewAnimationFrameIdRef.current);
    }
    fitViewRequestIdRef.current += 1;
    const requestId = fitViewRequestIdRef.current;
    fitViewAnimationFrameIdRef.current = requestAnimationFrame(() => {
      fitViewAnimationFrameIdRef.current = requestAnimationFrame(() => {
        fitViewAnimationFrameIdRef.current = null;
        void reactFlowInstance.fitView(fitViewOptions).then(() => {
          if (requestId !== fitViewRequestIdRef.current) {
            return;
          }
          setIsInitialViewportReady(true);
        });
      });
    });
  }, [fitViewOptions, nodes.length]);

  useEffect(() => {
    setHasMountedOnClient(true);
  }, []);

  useEffect(() => {
    setIsInitialViewportReady(false);
  }, [workflow.edges.length, workflow.id, workflow.nodes.length]);

  useEffect(() => {
    scheduleFitView();
    if (fitViewTimeoutIdRef.current !== null) {
      window.clearTimeout(fitViewTimeoutIdRef.current);
    }
    fitViewTimeoutIdRef.current = window.setTimeout(() => {
      fitViewTimeoutIdRef.current = null;
      scheduleFitView();
    }, 120);
  }, [scheduleFitView, workflow.edges.length, workflow.id, workflow.nodes.length]);

  useEffect(() => {
    const canvasContainer = canvasContainerRef.current;
    if (!canvasContainer || typeof ResizeObserver === "undefined") {
      return;
    }
    const resizeObserver = new ResizeObserver(() => {
      scheduleFitView();
    });
    resizeObserver.observe(canvasContainer);
    return () => {
      resizeObserver.disconnect();
    };
  }, [scheduleFitView]);

  useEffect(() => {
    return () => {
      if (fitViewAnimationFrameIdRef.current !== null) {
        cancelAnimationFrame(fitViewAnimationFrameIdRef.current);
      }
      if (fitViewTimeoutIdRef.current !== null) {
        window.clearTimeout(fitViewTimeoutIdRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={canvasContainerRef}
      style={{
        width: "100%",
        height: "100%",
        background: "#fbfbfc",
        fontFamily: "ui-sans-serif, system-ui",
        position: "relative",
      }}
    >
      {hasMountedOnClient ? (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={workflowCanvasNodeTypes}
          edgeTypes={workflowCanvasEdgeTypes}
          onInit={(instance) => {
            reactFlowInstanceRef.current = instance;
            scheduleFitView();
          }}
          onNodeClick={(_event, node) => onSelectNode(node.id)}
          style={{
            fontFamily: "inherit",
            opacity: isInitialViewportReady ? 1 : 0,
            transition: "opacity 120ms ease-out",
          }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable
          zoomOnScroll
          panOnScroll
        >
          <Background gap={18} size={1} color="#e5e7eb" />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
      ) : null}
      <div
        aria-hidden={isInitialViewportReady}
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
          opacity: isInitialViewportReady ? 0 : 1,
          transition: "opacity 180ms ease-out",
          background:
            "linear-gradient(rgba(251,251,252,0.96), rgba(251,251,252,0.96)), radial-gradient(circle at center, rgba(15,23,42,0.04) 1px, transparent 1px)",
          backgroundSize: "auto, 18px 18px",
        }}
      >
        <div
          style={{
            minWidth: 220,
            padding: "16px 18px",
            border: "1px solid #e5e7eb",
            background: "rgba(255,255,255,0.94)",
            boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 10,
                height: 10,
                background: "#2563eb",
                animation: "codemationCanvasLoaderPulse 1s ease-in-out infinite",
              }}
            />
            <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.45, textTransform: "uppercase", color: "#475569" }}>
              Workflow diagram
            </div>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>Loading...</div>
          <div style={{ display: "grid", gap: 6 }}>
            <div style={{ height: 8, width: 176, background: "linear-gradient(90deg, #e5e7eb, #f8fafc, #e5e7eb)", backgroundSize: "200% 100%", animation: "codemationCanvasLoaderShimmer 1.4s linear infinite" }} />
            <div style={{ height: 8, width: 132, background: "linear-gradient(90deg, #e5e7eb, #f8fafc, #e5e7eb)", backgroundSize: "200% 100%", animation: "codemationCanvasLoaderShimmer 1.4s linear infinite" }} />
          </div>
        </div>
      </div>
      <style>{`
        @property --codemation-node-ring-angle {
          syntax: "<angle>";
          initial-value: 0deg;
          inherits: false;
        }

        @keyframes codemationNodeSpin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes codemationNodeBreath {
          0%,
          100% {
            opacity: 0.45;
            transform: scale(0.992);
          }
          45% {
            opacity: 0.92;
            transform: scale(1.018);
          }
          70% {
            opacity: 0.72;
            transform: scale(1.003);
          }
        }

        @keyframes codemationNodeRingRotate {
          from {
            --codemation-node-ring-angle: 0deg;
          }
          to {
            --codemation-node-ring-angle: 360deg;
          }
        }

        @keyframes codemationCanvasLoaderPulse {
          0%,
          100% {
            opacity: 0.45;
            transform: scale(0.9);
          }
          50% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes codemationCanvasLoaderShimmer {
          0% {
            background-position: 200% 0;
          }
          100% {
            background-position: -200% 0;
          }
        }
      `}</style>
    </div>
  );
}

