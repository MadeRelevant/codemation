import { describe, expect, it } from "vitest";

import {
  WorkflowElkResultMapper,
  computeWorkflowPositionedLayout,
  type NodeExecutionSnapshot,
  type WorkflowDto,
} from "@codemation/canvas";

/**
 * Regression invariants for the layout split: ELK positions are structure-only
 * and a single positioned-layout pass can be re-used across many overlay calls
 * with different snapshots, with no ELK or layout work repeated. Locks down the
 * fix for the "edge label flicker" issue on `wf.dev.canvasLayoutStress`, where
 * the canvas was running a full async ELK pass on every realtime event.
 */
describe("layout split invariants", () => {
  const workflow: WorkflowDto = {
    id: "wf.test.layout-split",
    name: "Layout split",
    active: true,
    nodes: [
      { id: "a", kind: "trigger", type: "ManualTrigger" },
      { id: "b", kind: "node", type: "NoOp" },
      { id: "c", kind: "node", type: "NoOp" },
    ],
    edges: [
      { from: { nodeId: "a", output: "main" }, to: { nodeId: "b", input: "in" } },
      { from: { nodeId: "b", output: "main" }, to: { nodeId: "c", input: "in" } },
    ],
  };

  const NO_OP = (): void => {};

  function overlay(
    positionedLayout: Awaited<ReturnType<typeof computeWorkflowPositionedLayout>>,
    nodeSnapshotsByNodeId: Readonly<Record<string, NodeExecutionSnapshot>>,
  ) {
    return WorkflowElkResultMapper.toReactFlow({
      positionedLayout,
      nodeSnapshotsByNodeId,
      connectionInvocations: [],
      nodeStatusesByNodeId: {},
      credentialAttentionTooltipByNodeId: new Map(),
      selectedNodeId: null,
      propertiesTargetNodeId: null,
      pinnedNodeIds: new Set(),
      isLiveWorkflowView: false,
      isRunning: false,
      workflowNodeIdsWithBoundCredential: new Set(),
      onSelectNode: NO_OP,
      onOpenPropertiesNode: NO_OP,
      onRequestOpenCredentialEditForNode: NO_OP,
      onRunNode: NO_OP,
      onTogglePinnedOutput: NO_OP,
      onEditNodeOutput: NO_OP,
      onClearPinnedOutput: NO_OP,
    });
  }

  it("reuses one positioned layout across many overlays with different snapshots, recomputing edge labels each time", async () => {
    const positionedLayout = await computeWorkflowPositionedLayout(workflow);

    const noItems = overlay(positionedLayout, {});
    const oneItem = overlay(positionedLayout, {
      a: {
        runId: "r",
        workflowId: workflow.id,
        nodeId: "a",
        status: "completed",
        updatedAt: new Date().toISOString(),
        outputs: { main: [{ json: {} }] },
      },
    });
    const threeItems = overlay(positionedLayout, {
      a: {
        runId: "r",
        workflowId: workflow.id,
        nodeId: "a",
        status: "completed",
        updatedAt: new Date().toISOString(),
        outputs: { main: [{ json: {} }, { json: {} }, { json: {} }] },
      },
    });

    // Positions are computed once and remain byte-identical across overlay
    // passes — the property that lets us drop ELK off the hot path.
    expect(noItems.nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }))).toEqual(
      oneItem.nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })),
    );
    expect(noItems.nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }))).toEqual(
      threeItems.nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y })),
    );

    // Edge labels track the snapshot data passed to the overlay step.
    const edgeAB = (snapshot: ReturnType<typeof overlay>) =>
      snapshot.edges.find((edge) => edge.source === "a" && edge.target === "b");
    expect(edgeAB(noItems)?.label).toBeUndefined();
    expect(edgeAB(oneItem)?.label).toBe("1 item");
    expect(edgeAB(threeItems)?.label).toBe("3 items");
  });

  it("is synchronous: toReactFlow returns a plain object, not a Promise", async () => {
    const positionedLayout = await computeWorkflowPositionedLayout(workflow);
    const result = overlay(positionedLayout, {});
    expect(result).not.toBeInstanceOf(Promise);
    expect(Array.isArray(result.nodes)).toBe(true);
    expect(Array.isArray(result.edges)).toBe(true);
  });
});
