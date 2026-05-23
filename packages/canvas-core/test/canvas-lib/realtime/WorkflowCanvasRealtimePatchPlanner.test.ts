import { describe, expect, it } from "vitest";

import { WorkflowCanvasRealtimePatchPlanner } from "../../../src/canvas-lib/realtime/WorkflowCanvasRealtimePatchPlanner";
import type { NodeExecutionSnapshot } from "../../../src/realtime/realtimeDomainTypes";
import type { WorkflowDto } from "@codemation/host/dto";
import type { Edge as ReactFlowEdge, Node as ReactFlowNode } from "@xyflow/react";
import type { WorkflowCanvasNodeData } from "../../../src/canvas-lib/workflowCanvasNodeData";

// ── Minimal test fixtures ────────────────────────────────────────────────────

function makeWorkflow(nodeIds: string[], edges: { from: string; to: string }[] = []): WorkflowDto {
  return {
    id: "wf-1",
    name: "test",
    active: true,
    nodes: nodeIds.map((id) => ({
      id,
      kind: "node" as const,
      name: id,
      type: "test",
    })),
    edges: edges.map((e) => ({
      from: { nodeId: e.from, output: "main" },
      to: { nodeId: e.to, input: "in" },
    })),
  } as WorkflowDto;
}

function makeNode(nodeId: string, status?: NodeExecutionSnapshot["status"]): ReactFlowNode<WorkflowCanvasNodeData> {
  return {
    id: nodeId,
    type: "codemation",
    position: { x: 0, y: 0 },
    data: {
      nodeId,
      label: nodeId,
      type: "test",
      kind: "node",
      status,
      selected: false,
      propertiesTarget: false,
      isAttachment: false,
      isPinned: false,
      hasOutputData: false,
      isLiveWorkflowView: true,
      isRunning: false,
      sourceOutputPorts: ["main"],
      sourceOutputPortCounts: { main: 0 },
      targetInputPorts: ["in"],
      agentAttachments: { hasLanguageModel: false, hasTools: false },
      layoutWidthPx: 200,
      layoutHeightPx: 60,
      onSelectNode: () => {},
      onOpenPropertiesNode: () => {},
      onRunNode: () => {},
      onTogglePinnedOutput: () => {},
      onEditNodeOutput: () => {},
      onClearPinnedOutput: () => {},
    },
  };
}

function makeEdge(sourceId: string, targetId: string, index = 0): ReactFlowEdge {
  return {
    id: `${sourceId}:main->${targetId}:in:${index}`,
    source: sourceId,
    target: targetId,
    sourceHandle: "main",
    targetHandle: "in",
    label: undefined,
    style: { stroke: "#9ca3af", strokeWidth: 1.5 },
    labelStyle: { fill: "#6b7280", fontSize: 11, fontWeight: 800 },
    labelBgStyle: { fill: "rgba(249,250,251,0.96)", fillOpacity: 1 },
    markerEnd: { type: "arrowclosed" as never, width: 18, height: 18, color: "#9ca3af" },
  };
}

function makeSnapshot(
  nodeId: string,
  status: NodeExecutionSnapshot["status"],
  outputs?: Record<string, unknown[]>,
  inputsByPort?: Record<string, unknown[]>,
): NodeExecutionSnapshot {
  return {
    runId: "run-1",
    workflowId: "wf-1",
    nodeId,
    status,
    updatedAt: new Date().toISOString(),
    outputs: outputs as NodeExecutionSnapshot["outputs"],
    inputsByPort: inputsByPort as NodeExecutionSnapshot["inputsByPort"],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("WorkflowCanvasRealtimePatchPlanner", () => {
  it("emits empty patches when prev === next (short-circuit)", () => {
    const snapshots = { nodeA: makeSnapshot("nodeA", "completed", { main: [{}] }) };
    const workflow = makeWorkflow(["nodeA", "nodeB"], [{ from: "nodeA", to: "nodeB" }]);
    const nodes = [makeNode("nodeA", "completed"), makeNode("nodeB")];
    const edges = [makeEdge("nodeA", "nodeB")];

    const { nodeChanges, edgeChanges } = WorkflowCanvasRealtimePatchPlanner.plan({
      workflow,
      prevSnapshots: snapshots,
      nextSnapshots: snapshots, // same reference
      prevConnectionInvocations: [],
      nextConnectionInvocations: [],
      currentNodes: nodes,
      currentEdges: edges,
    });

    expect(nodeChanges).toHaveLength(0);
    expect(edgeChanges).toHaveLength(0);
  });

  it("emits a node replace change when status changes", () => {
    const prev = { nodeA: makeSnapshot("nodeA", "queued") };
    const next = { nodeA: makeSnapshot("nodeA", "running") };
    const workflow = makeWorkflow(["nodeA", "nodeB"], [{ from: "nodeA", to: "nodeB" }]);
    const nodes = [makeNode("nodeA", "queued"), makeNode("nodeB")];
    const edges = [makeEdge("nodeA", "nodeB")];

    const { nodeChanges } = WorkflowCanvasRealtimePatchPlanner.plan({
      workflow,
      prevSnapshots: prev,
      nextSnapshots: next,
      prevConnectionInvocations: [],
      nextConnectionInvocations: [],
      currentNodes: nodes,
      currentEdges: edges,
    });

    expect(nodeChanges).toHaveLength(1);
    expect(nodeChanges[0]!.id).toBe("nodeA");
    expect(nodeChanges[0]!.type).toBe("replace");
    expect(nodeChanges[0]!.item.data.status).toBe("running");
    // data.isRunning is workflow-level (consumed by the toolbar's "Run from
    // here" disable rule); patches preserve the seeded value. A workflow-level
    // toggle re-seeds via `seedSignature` rather than per-node patching.
    expect(nodeChanges[0]!.item.data.isRunning).toBe(false);
  });

  it("emits edge replace changes for outgoing edges of changed node", () => {
    const prev = { nodeA: makeSnapshot("nodeA", "running") };
    const next = { nodeA: makeSnapshot("nodeA", "completed", { main: [{ json: {} }] }) };
    const workflow = makeWorkflow(["nodeA", "nodeB"], [{ from: "nodeA", to: "nodeB" }]);
    const nodes = [makeNode("nodeA", "running"), makeNode("nodeB")];
    const edges = [makeEdge("nodeA", "nodeB")];

    const { nodeChanges, edgeChanges } = WorkflowCanvasRealtimePatchPlanner.plan({
      workflow,
      prevSnapshots: prev,
      nextSnapshots: next,
      prevConnectionInvocations: [],
      nextConnectionInvocations: [],
      currentNodes: nodes,
      currentEdges: edges,
    });

    expect(nodeChanges).toHaveLength(1);
    // Edge from nodeA to nodeB should be patched with label "1 item"
    expect(edgeChanges).toHaveLength(1);
    expect(edgeChanges[0]!.id).toBe("nodeA:main->nodeB:in:0");
    expect(edgeChanges[0]!.item.label).toBe("1 item");
  });

  it("emits empty patches when snapshot is canvas-equivalent (same status + same port counts)", () => {
    // Both snapshots have the same status and same output counts — no visible change
    const prevSnap = makeSnapshot("nodeA", "completed", { main: [{}] });
    const nextSnap = makeSnapshot("nodeA", "completed", { main: [{}] });
    // Different object but same visible data
    const prev = { nodeA: prevSnap };
    const next = { nodeA: nextSnap };
    const workflow = makeWorkflow(["nodeA", "nodeB"], [{ from: "nodeA", to: "nodeB" }]);
    const nodes = [makeNode("nodeA", "completed"), makeNode("nodeB")];
    const edges = [makeEdge("nodeA", "nodeB")];

    const { nodeChanges, edgeChanges } = WorkflowCanvasRealtimePatchPlanner.plan({
      workflow,
      prevSnapshots: prev,
      nextSnapshots: next,
      prevConnectionInvocations: [],
      nextConnectionInvocations: [],
      currentNodes: nodes,
      currentEdges: edges,
    });

    expect(nodeChanges).toHaveLength(0);
    expect(edgeChanges).toHaveLength(0);
  });

  it("first snapshot for a node (prev=undefined) emits a replace change", () => {
    const prev = {};
    const next = { nodeA: makeSnapshot("nodeA", "queued") };
    const workflow = makeWorkflow(["nodeA", "nodeB"], [{ from: "nodeA", to: "nodeB" }]);
    const nodes = [makeNode("nodeA"), makeNode("nodeB")];
    const edges = [makeEdge("nodeA", "nodeB")];

    const { nodeChanges } = WorkflowCanvasRealtimePatchPlanner.plan({
      workflow,
      prevSnapshots: prev,
      nextSnapshots: next,
      prevConnectionInvocations: [],
      nextConnectionInvocations: [],
      currentNodes: nodes,
      currentEdges: edges,
    });

    expect(nodeChanges).toHaveLength(1);
    expect(nodeChanges[0]!.item.data.status).toBe("queued");
  });

  it("updates sourceOutputPortCounts in node replace change", () => {
    const prev = { nodeA: makeSnapshot("nodeA", "running") };
    const next = { nodeA: makeSnapshot("nodeA", "completed", { main: [{}] }) };
    const workflow = makeWorkflow(["nodeA"], []);
    const nodes = [makeNode("nodeA", "running")];

    const { nodeChanges } = WorkflowCanvasRealtimePatchPlanner.plan({
      workflow,
      prevSnapshots: prev,
      nextSnapshots: next,
      prevConnectionInvocations: [],
      nextConnectionInvocations: [],
      currentNodes: nodes,
      currentEdges: [],
    });

    expect(nodeChanges).toHaveLength(1);
    expect(nodeChanges[0]!.item.data.sourceOutputPortCounts.main).toBe(1);
  });

  it("patches incoming edges (target-side) when target snapshot changes", () => {
    const prev = {};
    const next = { nodeB: makeSnapshot("nodeB", "queued", undefined, { in: [{}] }) };
    const workflow = makeWorkflow(["nodeA", "nodeB"], [{ from: "nodeA", to: "nodeB" }]);
    const nodes = [makeNode("nodeA"), makeNode("nodeB")];
    const edges = [makeEdge("nodeA", "nodeB")];

    const { edgeChanges } = WorkflowCanvasRealtimePatchPlanner.plan({
      workflow,
      prevSnapshots: prev,
      nextSnapshots: next,
      prevConnectionInvocations: [],
      nextConnectionInvocations: [],
      currentNodes: nodes,
      currentEdges: edges,
    });

    // The edge should get label "1 item" from target's inputsByPort
    expect(edgeChanges).toHaveLength(1);
    expect(edgeChanges[0]!.item.label).toBe("1 item");
  });

  it("does not emit a duplicate edge change when both source and target nodes change", () => {
    const prev = {};
    const next = {
      nodeA: makeSnapshot("nodeA", "completed", { main: [{}] }),
      nodeB: makeSnapshot("nodeB", "queued", undefined, { in: [{}] }),
    };
    const workflow = makeWorkflow(["nodeA", "nodeB"], [{ from: "nodeA", to: "nodeB" }]);
    const nodes = [makeNode("nodeA"), makeNode("nodeB")];
    const edges = [makeEdge("nodeA", "nodeB")];

    const { edgeChanges } = WorkflowCanvasRealtimePatchPlanner.plan({
      workflow,
      prevSnapshots: prev,
      nextSnapshots: next,
      prevConnectionInvocations: [],
      nextConnectionInvocations: [],
      currentNodes: nodes,
      currentEdges: edges,
    });

    // Should only appear once, not twice (deduplication via patchedEdgeIds)
    expect(edgeChanges).toHaveLength(1);
  });
});
