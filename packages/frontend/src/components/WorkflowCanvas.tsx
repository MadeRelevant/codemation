"use client";

import dagre from "dagre";
import { Bot, Boxes, Brain, CircleAlert, CircleCheckBig, Clock3, GitBranch, Globe, type LucideIcon, PlaySquare, SquareStack, Workflow, Wrench } from "lucide-react";
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
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NodeExecutionSnapshot } from "../realtime/realtime";

type WorkflowDto = Readonly<{
  id: string;
  name: string;
  nodes: ReadonlyArray<Readonly<{ id: string; kind: string; name?: string; type: string; role?: string; icon?: string; parentNodeId?: string }>>;
  edges: ReadonlyArray<
    Readonly<{
      from: Readonly<{ nodeId: string; output: string }>;
      to: Readonly<{ nodeId: string; input: string }>;
    }>
  >;
}>;

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
}>;

const workflowCanvasNodeTypes = { codemation: CodemationNode };
const workflowCanvasEdgeTypes = { straightCount: StraightCountEdge };
const minimumActiveStatusVisibilityMs = 300;

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
  const [visibleStatusesByNodeId, setVisibleStatusesByNodeId] = useState<Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>>>(
    () => Object.fromEntries(Object.entries(nodeSnapshotsByNodeId).map(([nodeId, snapshot]) => [nodeId, snapshot.status])),
  );
  const activeStartedAtByNodeIdRef = useRef(new Map<string, number>());
  const timeoutIdByNodeIdRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const latestRawStatusesByNodeIdRef = useRef<Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>>>({});

  useEffect(() => {
    const now = Date.now();
    latestRawStatusesByNodeIdRef.current = Object.fromEntries(Object.entries(nodeSnapshotsByNodeId).map(([nodeId, snapshot]) => [nodeId, snapshot.status]));
    setVisibleStatusesByNodeId((currentStatusesByNodeId) => {
      const nextStatusesByNodeId: Record<string, NodeExecutionSnapshot["status"] | undefined> = {};
      const rawStatusesByNodeId = latestRawStatusesByNodeIdRef.current;

      for (const nodeId of new Set([...Object.keys(currentStatusesByNodeId), ...Object.keys(rawStatusesByNodeId)])) {
        const rawStatus = rawStatusesByNodeId[nodeId];
        const currentVisibleStatus = currentStatusesByNodeId[nodeId];
        const pendingTimeoutId = timeoutIdByNodeIdRef.current.get(nodeId);
        const isRawStatusActive = rawStatus === "running" || rawStatus === "queued";
        const isCurrentVisibleStatusActive = currentVisibleStatus === "running" || currentVisibleStatus === "queued";

        if (isRawStatusActive) {
          if (pendingTimeoutId) {
            clearTimeout(pendingTimeoutId);
            timeoutIdByNodeIdRef.current.delete(nodeId);
          }

          if (!isCurrentVisibleStatusActive) {
            activeStartedAtByNodeIdRef.current.set(nodeId, now);
          }

          nextStatusesByNodeId[nodeId] = rawStatus;
          continue;
        }

        if (!isCurrentVisibleStatusActive || rawStatus === undefined) {
          if (pendingTimeoutId) {
            clearTimeout(pendingTimeoutId);
            timeoutIdByNodeIdRef.current.delete(nodeId);
          }

          activeStartedAtByNodeIdRef.current.delete(nodeId);
          nextStatusesByNodeId[nodeId] = rawStatus;
          continue;
        }

        const activeStartedAt = activeStartedAtByNodeIdRef.current.get(nodeId) ?? now;
        const remainingVisibilityMs = minimumActiveStatusVisibilityMs - (now - activeStartedAt);
        if (remainingVisibilityMs <= 0) {
          if (pendingTimeoutId) {
            clearTimeout(pendingTimeoutId);
            timeoutIdByNodeIdRef.current.delete(nodeId);
          }

          activeStartedAtByNodeIdRef.current.delete(nodeId);
          nextStatusesByNodeId[nodeId] = rawStatus;
          continue;
        }

        if (!pendingTimeoutId) {
          const timeoutId = setTimeout(() => {
            activeStartedAtByNodeIdRef.current.delete(nodeId);
            timeoutIdByNodeIdRef.current.delete(nodeId);
            setVisibleStatusesByNodeId((latestStatusesByNodeId) => ({
              ...latestStatusesByNodeId,
              [nodeId]: latestRawStatusesByNodeIdRef.current[nodeId],
            }));
          }, remainingVisibilityMs);
          timeoutIdByNodeIdRef.current.set(nodeId, timeoutId);
        }

        nextStatusesByNodeId[nodeId] = currentVisibleStatus;
      }

      return nextStatusesByNodeId;
    });

  }, [nodeSnapshotsByNodeId]);

  useEffect(() => {
    return () => {
      for (const timeoutId of timeoutIdByNodeIdRef.current.values()) {
        clearTimeout(timeoutId);
      }
      timeoutIdByNodeIdRef.current.clear();
    };
  }, []);

  return visibleStatusesByNodeId;
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
  if (status === "failed") {
    return <CircleAlert size={15} style={{ color: "#b91c1c" }} strokeWidth={2.1} />;
  }
  if (status === "running" || status === "queued") {
    return null;
  }
  return <Clock3 size={15} style={{ color: "#6b7280" }} strokeWidth={2.1} />;
}

function CodemationNode({ data }: { data: NodeData }) {
  const TypeIcon = iconForNode(data.type, data.role, data.icon);
  const isQueued = data.status === "queued";
  const isRunning = data.status === "running";
  const isActive = isQueued || isRunning;
  const isSelected = data.selected;
  const isAttachment = data.isAttachment;
  const isAgent = data.role === "agent";
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
  return (
    <div
      style={{
        width: isAttachment ? 144 : 196,
        height: 54,
        borderRadius: 0,
        background: "transparent",
        boxShadow: "none",
        position: "relative",
        overflow: "visible",
      }}
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
        style={{
          display: "flex",
          flexDirection: "row",
          alignItems: "center",
          gap: isAttachment ? 8 : 10,
          height: "100%",
          padding: isAttachment ? "0 10px" : "0 10px",
          borderRadius: 0,
          border: isActive ? "1px solid transparent" : isSelected ? "1px solid #111827" : "1px solid #d1d5db",
          background: isSelected ? (isAttachment ? "#fffaf0" : "#fffdf5") : isAttachment ? "#fcfcfd" : "white",
          boxShadow: isActive
            ? "0 2px 6px rgba(15,23,42,0.05)"
            : isSelected
              ? "0 0 0 1px rgba(245,158,11,0.45) inset, 0 2px 10px rgba(15,23,42,0.08)"
              : "0 2px 6px rgba(15,23,42,0.05)",
          position: "relative",
          overflow: "hidden",
        }}
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
        {statusIconForNode(data.status) ? (
          <div style={{ flex: "0 0 auto", display: "grid", placeItems: "center", color: "#111827" }}>
            {statusIconForNode(data.status)}
          </div>
        ) : null}
      </div>
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
    const targetInputItems = targetSnapshot?.inputsByPort?.[e.to.input];
    const sourceOutputItems = sourceSnapshot?.outputs?.[e.from.output];
    const edgeItemCount = targetInputItems?.length ?? sourceOutputItems?.length ?? 0;
    const edgeLabel = edgeItemCount > 0 ? `${edgeItemCount} item${edgeItemCount === 1 ? "" : "s"}` : undefined;
    return {
      id: `${e.from.nodeId}:${e.from.output}->${e.to.nodeId}:${e.to.input}:${i}`,
      source: e.from.nodeId,
      target: e.to.nodeId,
      sourceHandle: isAttachmentEdge ? attachmentSourceHandle : undefined,
      targetHandle: isAttachmentEdge ? "attachment-target" : undefined,
      animated: false,
      type: isAttachmentEdge ? "smoothstep" : isStraightMainEdge ? "straightCount" : "step",
      style: {
        stroke: isAttachmentEdge ? "#94a3b8" : "#111827",
        strokeWidth: isAttachmentEdge ? 1.35 : 1.5,
        strokeDasharray: isAttachmentEdge ? "2 6" : undefined,
        strokeLinecap: isAttachmentEdge ? "round" : undefined,
      },
      label: edgeLabel,
      labelStyle: {
        fill: isAttachmentEdge ? "#475569" : "#111827",
        fontSize: isAttachmentEdge ? 10 : 11,
        fontWeight: 800,
      },
      labelBgStyle: {
        fill: isAttachmentEdge ? "rgba(248,250,252,0.92)" : "rgba(255,253,245,0.96)",
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
            color: "#111827",
          },
    };
  });

  return { nodes, edges };
}

export function WorkflowCanvas(args: {
  workflow: WorkflowDto;
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}) {
  const { workflow, nodeSnapshotsByNodeId, selectedNodeId, onSelectNode } = args;
  const [hasMountedOnClient, setHasMountedOnClient] = useState(false);
  const [isInitialViewportReady, setIsInitialViewportReady] = useState(false);
  const visibleNodeStatusesByNodeId = useVisibleNodeStatuses(nodeSnapshotsByNodeId);
  const { nodes, edges } = useMemo(
    () => layoutWorkflow(workflow, nodeSnapshotsByNodeId, visibleNodeStatusesByNodeId, selectedNodeId),
    [nodeSnapshotsByNodeId, selectedNodeId, visibleNodeStatusesByNodeId, workflow],
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
    <div ref={canvasContainerRef} style={{ width: "100%", height: "100%", background: "#fbfbfc", fontFamily: "ui-sans-serif, system-ui" }}>
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
          <Controls showInteractive={false} position="top-left" />
        </ReactFlow>
      ) : null}
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
      `}</style>
    </div>
  );
}

