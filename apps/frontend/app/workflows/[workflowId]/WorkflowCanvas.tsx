"use client";

import dagre from "dagre";
import { Background, Controls, Handle, Position, ReactFlow, type Edge as ReactFlowEdge, type Node as ReactFlowNode } from "@xyflow/react";
import { useMemo } from "react";

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

type NodeData = Readonly<{ label: string; type: string; kind: string }>;

function iconForType(type: string) {
  const t = type.toLowerCase();

  // Minimal, dependency-free icons.
  if (t.includes("if")) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M12 3l9 9-9 9-9-9 9-9z" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (t.includes("subworkflow")) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7z" stroke="currentColor" strokeWidth="2" />
        <path d="M8 9h8M8 13h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (t.includes("map")) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 7h6M14 7h6M4 12h10M4 17h6M14 17h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (t.includes("trigger")) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M9 18a3 3 0 0 1-3-3V9a3 3 0 1 1 6 0v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 12h3a3 3 0 0 1 3 3v1a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4v-1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (t.includes("agent") || t.includes("ai")) {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M7 7a5 5 0 0 1 10 0v4a3 3 0 0 1-3 3H10a3 3 0 0 1-3-3V7z" stroke="currentColor" strokeWidth="2" />
        <path d="M9 18h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M7 7h10v10H7V7z" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function CodemationNode({ data }: { data: NodeData }) {
  return (
    <div
      style={{
        width: 180,
        borderRadius: 14,
        border: "1px solid #e5e7eb",
        background: "white",
        boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
        overflow: "hidden",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ width: 10, height: 10, background: "#111827" }} />
      <Handle type="source" position={Position.Right} style={{ width: 10, height: 10, background: "#111827" }} />

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px 10px" }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            background: "#f3f4f6",
            display: "grid",
            placeItems: "center",
            color: "#111827",
          }}
        >
          {iconForType(data.type)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 13, lineHeight: 1.2, wordBreak: "break-word" }}>
            {data.label}
          </div>
          <div style={{ fontSize: 11, opacity: 0.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {data.type}
          </div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 11, opacity: 0.65, padding: "2px 8px", border: "1px solid #e5e7eb", borderRadius: 999 }}>
          {data.kind}
        </div>
      </div>
    </div>
  );
}

function layoutWorkflow(workflow: WorkflowDto): Readonly<{ nodes: ReactFlowNode<NodeData>[]; edges: ReactFlowEdge[] }> {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: "LR", ranksep: 50, nodesep: 20, edgesep: 8 });

  const nodeWidth = 180;
  const nodeHeight = 86;

  for (const n of workflow.nodes) dagreGraph.setNode(n.id, { width: nodeWidth, height: nodeHeight });
  for (const [i, e] of workflow.edges.entries()) dagreGraph.setEdge(e.from.nodeId, e.to.nodeId, { i });

  dagre.layout(dagreGraph);

  const nodes: ReactFlowNode<NodeData>[] = workflow.nodes.map((n) => {
    const pos = dagreGraph.node(n.id) as { x: number; y: number } | undefined;
    const label = n.name ?? n.type ?? n.id;
    return {
      id: n.id,
      type: "codemation",
      position: { x: (pos?.x ?? 0) - nodeWidth / 2, y: (pos?.y ?? 0) - nodeHeight / 2 },
      data: { label, type: n.type, kind: n.kind },
      draggable: false,
    };
  });

  const edges: ReactFlowEdge[] = workflow.edges.map((e, i) => ({
    id: `${e.from.nodeId}:${e.from.output}->${e.to.nodeId}:${e.to.input}:${i}`,
    source: e.from.nodeId,
    target: e.to.nodeId,
    animated: false,
    style: { stroke: "#111827", strokeWidth: 1.5 },
  }));

  return { nodes, edges };
}

export function WorkflowCanvas({ workflow }: { workflow: WorkflowDto }) {
  const { nodes, edges } = useMemo(() => layoutWorkflow(workflow), [workflow]);

  return (
    <div style={{ width: "100%", height: "100%", background: "#fbfbfc" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={{ codemation: CodemationNode }}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        zoomOnScroll
        panOnScroll
      >
        <Background gap={18} size={1} color="#e5e7eb" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}

