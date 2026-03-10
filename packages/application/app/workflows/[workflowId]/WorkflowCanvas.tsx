"use client";

import dagre from "dagre";
import { Bot, Boxes, CircleAlert, CircleCheckBig, Clock3, GitBranch, LoaderCircle, type LucideIcon, PlaySquare, SquareStack, Workflow } from "lucide-react";
import { Background, Controls, Handle, MarkerType, Position, ReactFlow, type Edge as ReactFlowEdge, type Node as ReactFlowNode } from "@xyflow/react";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import type { NodeExecutionSnapshot } from "../../_realtime/realtime";

type WorkflowDto = Readonly<{
  id: string;
  name: string;
  nodes: ReadonlyArray<Readonly<{ id: string; kind: string; name?: string; type: string }>>;
  edges: ReadonlyArray<
    Readonly<{
      from: Readonly<{ nodeId: string; output: string }>;
      to: Readonly<{ nodeId: string; input: string }>;
    }>
  >;
}>;

type NodeData = Readonly<{
  label: string;
  type: string;
  kind: string;
  status?: NodeExecutionSnapshot["status"];
  selected: boolean;
}>;

const workflowCanvasNodeTypes = { codemation: CodemationNode };
const minimumActiveStatusVisibilityMs = 300;

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

function iconForType(type: string): LucideIcon {
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
  const TypeIcon = iconForType(data.type);
  const isQueued = data.status === "queued";
  const isRunning = data.status === "running";
  const isActive = isQueued || isRunning;
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
        width: 196,
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
      <Handle type="target" position={Position.Left} style={{ width: 8, height: 8, background: "#111827", border: "1px solid white" }} />
      <Handle type="source" position={Position.Right} style={{ width: 8, height: 8, background: "#111827", border: "1px solid white" }} />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          height: "100%",
          padding: "0 10px",
          borderRadius: 0,
          border: isActive ? "1px solid transparent" : data.selected ? "1px solid #2563eb" : "1px solid #d1d5db",
          background: "white",
          boxShadow: isActive ? "0 2px 6px rgba(15,23,42,0.05)" : data.selected ? "0 0 0 1px #93c5fd inset" : "0 2px 6px rgba(15,23,42,0.05)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 0,
            background: "#f8fafc",
            display: "grid",
            placeItems: "center",
            color: "#111827",
            flex: "0 0 auto",
          }}
        >
          <TypeIcon size={15} strokeWidth={1.9} />
        </div>
        <div style={{ minWidth: 0, flex: "1 1 auto" }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 13,
              lineHeight: 1.2,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {data.label}
          </div>
        </div>
        {statusIconForNode(data.status) ? (
          <div style={{ flex: "0 0 auto", display: "grid", placeItems: "center", color: "#111827" }}>{statusIconForNode(data.status)}</div>
        ) : null}
      </div>
    </div>
  );
}

function layoutWorkflow(
  workflow: WorkflowDto,
  nodeStatusesByNodeId: Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>>,
  selectedNodeId: string | null,
): Readonly<{ nodes: ReactFlowNode<NodeData>[]; edges: ReactFlowEdge[] }> {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "LR", ranksep: 72, nodesep: 28, edgesep: 12 });

  const nodeWidth = 196;
  const nodeHeight = 54;
  const branchSpacing = nodeHeight + 28;

  for (const n of workflow.nodes) dagreGraph.setNode(n.id, { width: nodeWidth, height: nodeHeight });
  for (const [i, e] of workflow.edges.entries()) dagreGraph.setEdge(e.from.nodeId, e.to.nodeId, { i });

  dagre.layout(dagreGraph);

  const positionsByNodeId = new Map<string, { x: number; y: number }>();
  for (const node of workflow.nodes) {
    const position = dagreGraph.node(node.id) as { x: number; y: number } | undefined;
    positionsByNodeId.set(node.id, { x: position?.x ?? 0, y: position?.y ?? 0 });
  }

  const outgoingNodeIdsByNodeId = new Map<string, string[]>();
  const incomingNodeIdsByNodeId = new Map<string, string[]>();
  for (const edge of workflow.edges) {
    const outgoing = outgoingNodeIdsByNodeId.get(edge.from.nodeId) ?? [];
    outgoing.push(edge.to.nodeId);
    outgoingNodeIdsByNodeId.set(edge.from.nodeId, outgoing);

    const incoming = incomingNodeIdsByNodeId.get(edge.to.nodeId) ?? [];
    incoming.push(edge.from.nodeId);
    incomingNodeIdsByNodeId.set(edge.to.nodeId, incoming);
  }

  for (const node of workflow.nodes) {
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

  for (const node of workflow.nodes) {
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

  const nodes: ReactFlowNode<NodeData>[] = workflow.nodes.map((n) => {
    const pos = positionsByNodeId.get(n.id);
    const label = n.name ?? n.type ?? n.id;
    return {
      id: n.id,
      type: "codemation",
      position: { x: (pos?.x ?? 0) - nodeWidth / 2, y: (pos?.y ?? 0) - nodeHeight / 2 },
      data: { label, type: n.type, kind: n.kind, status: nodeStatusesByNodeId[n.id], selected: selectedNodeId === n.id },
      draggable: false,
      sourcePosition: Position.Right,
      targetPosition: Position.Left,
    };
  });

  const edges: ReactFlowEdge[] = workflow.edges.map((e, i) => ({
    id: `${e.from.nodeId}:${e.from.output}->${e.to.nodeId}:${e.to.input}:${i}`,
    source: e.from.nodeId,
    target: e.to.nodeId,
    animated: false,
    type: "step",
    style: { stroke: "#111827", strokeWidth: 1.5 },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 18,
      height: 18,
      color: "#111827",
    },
  }));

  return { nodes, edges };
}

export function WorkflowCanvas(args: {
  workflow: WorkflowDto;
  nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}) {
  const { workflow, nodeSnapshotsByNodeId, selectedNodeId, onSelectNode } = args;
  const visibleNodeStatusesByNodeId = useVisibleNodeStatuses(nodeSnapshotsByNodeId);
  const { nodes, edges } = useMemo(
    () => layoutWorkflow(workflow, visibleNodeStatusesByNodeId, selectedNodeId),
    [selectedNodeId, visibleNodeStatusesByNodeId, workflow],
  );

  return (
    <div style={{ width: "100%", height: "100%", background: "#fbfbfc", fontFamily: "ui-sans-serif, system-ui" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={workflowCanvasNodeTypes}
        onNodeClick={(_event, node) => onSelectNode(node.id)}
        style={{ fontFamily: "inherit" }}
        fitView
        fitViewOptions={{ padding: 0.24, minZoom: 0.2, maxZoom: 1 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        zoomOnScroll
        panOnScroll
      >
        <Background gap={18} size={1} color="#e5e7eb" />
        <Controls showInteractive={false} position="top-left" />
      </ReactFlow>
      <style jsx global>{`
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

