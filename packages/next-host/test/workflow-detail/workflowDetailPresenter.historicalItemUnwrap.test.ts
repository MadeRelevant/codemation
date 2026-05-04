import type { ExecutionInstanceDto, NodeId, WorkflowId } from "@codemation/core/browser";
import { describe, expect, it } from "vitest";

import { WorkflowDetailPresenter } from "../../src/features/workflows/lib/workflowDetail/WorkflowDetailPresenter";
import type { ExecutionNode } from "../../src/features/workflows/lib/workflowDetail/workflowDetailTypes";

/**
 * Regression test for the "data doubly-wrapped in json" bug visible in the canvas inspector
 * for historical (test-suite child) runs:
 *
 * Trigger outputs are persisted as already-Item-shaped JSON (`[{ json: { idx, ... } }]`),
 * but `WorkflowDetailPresenter.snapshotFromExecutionInstance` → `jsonValueToPortItems` →
 * `jsonValueToMainItems` was assuming raw-JSON entries and re-wrapping every array element
 * as `{ json: <entry> }`. Result: the snapshot's outputs became `[{ json: { json: {...} } }]`,
 * the inspector's `toJsonValue` unwrapped one layer, and users saw an extraneous `"json"` key
 * in the JSON viewer.
 *
 * The fix: detect already-Item-shaped entries and pass them through untouched. This test
 * exercises that path through the public API (`buildHistoricalExecutionNodes`).
 */
describe("WorkflowDetailPresenter — historical-run output items don't get double-wrapped", () => {
  const workflow = {
    id: "wf.test" as WorkflowId,
    name: "WF",
    nodes: [
      {
        id: "trigger" as NodeId,
        kind: "trigger" as const,
        type: Symbol.for("TestTrigger"),
        config: { triggerKind: "test" as const },
      },
    ],
    edges: [],
  };

  function instance(overrides: Partial<ExecutionInstanceDto> = {}): ExecutionInstanceDto {
    return {
      instanceId: overrides.instanceId ?? ("inst_1" as ExecutionInstanceDto["instanceId"]),
      slotNodeId: overrides.slotNodeId ?? ("trigger" as NodeId),
      workflowNodeId: overrides.workflowNodeId ?? ("trigger" as NodeId),
      kind: overrides.kind ?? "nodeActivation",
      runIndex: overrides.runIndex ?? 0,
      batchId: overrides.batchId ?? ("batch_1" as ExecutionInstanceDto["batchId"]),
      status: overrides.status ?? "completed",
      itemCount: overrides.itemCount ?? 1,
      ...overrides,
    } as ExecutionInstanceDto;
  }

  function findTrigger(nodes: ReadonlyArray<ExecutionNode>): ExecutionNode {
    const node = nodes.find((n) => n.workflowNodeId === "trigger");
    if (!node) throw new Error("Trigger node not found in execution nodes");
    return node;
  }

  it("preserves Item shape (no extra `json` key) when outputJson is already Item-shaped", () => {
    // Trigger outputs are persisted with the engine's Item wrapper baked in:
    const persistedOutputJson = { main: [{ json: { idx: 0, expectedSum: 1, source: "test" } }] };
    const detail = {
      runId: "run_1",
      workflowId: "wf.test",
      startedAt: "2026-05-04T10:00:00Z",
      status: "completed",
      slotStates: [],
      executionInstances: [instance({ outputJson: persistedOutputJson })],
    } as Parameters<typeof WorkflowDetailPresenter.buildHistoricalExecutionNodes>[1];

    const nodes = WorkflowDetailPresenter.buildHistoricalExecutionNodes(workflow, detail);
    const triggerNode = findTrigger(nodes);
    const mainItems = triggerNode.snapshot?.outputs?.main;

    // The snapshot must carry the original Item array — NOT a re-wrapped `[{json: {json: ...}}]`.
    expect(mainItems).toEqual([{ json: { idx: 0, expectedSum: 1, source: "test" } }]);

    // Also assert the user-visible JSON value (what the inspector would render via toJsonValue)
    // is the inner data, not an `{ json: ... }` wrapper.
    const jsonValue = WorkflowDetailPresenter.toJsonValue(mainItems);
    expect(jsonValue).toEqual({ idx: 0, expectedSum: 1, source: "test" });
    expect(jsonValue).not.toHaveProperty("json");
  });

  it("still wraps raw JSON values when outputJson contains plain objects (back-compat)", () => {
    // Some runnable nodes may persist port arrays of raw values (no `json` key); preserve
    // the existing wrapping behavior for those — this test pins it.
    const persistedOutputJson = { main: [{ idx: 0, expectedSum: 1 }] };
    const detail = {
      runId: "run_1",
      workflowId: "wf.test",
      startedAt: "2026-05-04T10:00:00Z",
      status: "completed",
      slotStates: [],
      executionInstances: [instance({ outputJson: persistedOutputJson })],
    } as Parameters<typeof WorkflowDetailPresenter.buildHistoricalExecutionNodes>[1];

    const nodes = WorkflowDetailPresenter.buildHistoricalExecutionNodes(workflow, detail);
    const triggerNode = findTrigger(nodes);
    expect(triggerNode.snapshot?.outputs?.main).toEqual([{ json: { idx: 0, expectedSum: 1 } }]);
  });
});
