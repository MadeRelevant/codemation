import { describe, expect, it } from "vitest";

import type { WorkflowDto } from "@codemation/host/dto";
import type { NodeExecutionSnapshot } from "../../../src/realtime/realtimeDomainTypes";
import { WorkflowCanvasTopologicalStatusCap } from "../../../src/canvas-lib/realtime/WorkflowCanvasTopologicalStatusCap";

// ── Minimal test fixtures ────────────────────────────────────────────────────

function makeWorkflow(
  nodeIds: string[],
  edges: { from: string; to: string }[] = [],
  nodeRoles?: Record<string, string>,
): WorkflowDto {
  return {
    id: "wf-1",
    name: "test",
    active: true,
    nodes: nodeIds.map((id) => ({
      id,
      kind: "node" as const,
      name: id,
      type: "test",
      role: nodeRoles?.[id],
    })),
    edges: edges.map((e) => ({
      from: { nodeId: e.from, output: "main" },
      to: { nodeId: e.to, input: "in" },
    })),
  } as WorkflowDto;
}

function statuses(
  entries: Array<[string, NodeExecutionSnapshot["status"] | undefined]>,
): Readonly<Record<string, NodeExecutionSnapshot["status"] | undefined>> {
  return Object.fromEntries(entries);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("WorkflowCanvasTopologicalStatusCap", () => {
  it("linear chain A→B→C: cap is identity (no fan-out, no blocking)", () => {
    // All nodes complete in order; each upstream completes before downstream is
    // touched — cap should pass through engine statuses unchanged.
    const workflow = makeWorkflow(
      ["A", "B", "C"],
      [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
      ],
    );
    const input = statuses([
      ["A", "completed"],
      ["B", "completed"],
      ["C", "completed"],
    ]);

    const result = WorkflowCanvasTopologicalStatusCap.applyCap({ workflow, statusByNodeId: input });

    expect(result["A"]).toBe("completed");
    expect(result["B"]).toBe("completed");
    expect(result["C"]).toBe("completed");
  });

  it("linear chain: upstream still running blocks downstream", () => {
    const workflow = makeWorkflow(["A", "B"], [{ from: "A", to: "B" }]);
    // Engine says B is completed but A is still running
    const input = statuses([
      ["A", "running"],
      ["B", "completed"],
    ]);

    const result = WorkflowCanvasTopologicalStatusCap.applyCap({ workflow, statusByNodeId: input });

    // A has no upstream → passes through
    expect(result["A"]).toBe("running");
    // B is capped to A's running state
    expect(result["B"]).toBe("running");
  });

  it("fan-out if→{branch, fan-in}: fan-in displays running while branch is queued/running", () => {
    // Topology:
    //   trigger → if
    //   if → delay (branch internal)
    //   if → fan-in (direct bypass)
    //   delay → fan-in
    //   fan-in → sink
    const workflow = makeWorkflow(
      ["trigger", "if", "delay", "fan-in", "sink"],
      [
        { from: "trigger", to: "if" },
        { from: "if", to: "delay" },
        { from: "if", to: "fan-in" },
        { from: "delay", to: "fan-in" },
        { from: "fan-in", to: "sink" },
      ],
    );

    // Engine: delay is still running, fan-in engine already completed (fast path)
    const input = statuses([
      ["trigger", "completed"],
      ["if", "completed"],
      ["delay", "running"],
      ["fan-in", "completed"],
      ["sink", "completed"],
    ]);

    const result = WorkflowCanvasTopologicalStatusCap.applyCap({ workflow, statusByNodeId: input });

    // delay is running → fan-in should be capped to running
    expect(result["delay"]).toBe("running");
    expect(result["fan-in"]).toBe("running");
    // sink depends on fan-in (displayed=running) → also running
    expect(result["sink"]).toBe("running");
  });

  it("fan-out: fan-in displays completed once all branch nodes are completed", () => {
    const workflow = makeWorkflow(
      ["trigger", "if", "delay", "fan-in"],
      [
        { from: "trigger", to: "if" },
        { from: "if", to: "delay" },
        { from: "if", to: "fan-in" },
        { from: "delay", to: "fan-in" },
      ],
    );

    // All branches completed
    const input = statuses([
      ["trigger", "completed"],
      ["if", "completed"],
      ["delay", "completed"],
      ["fan-in", "completed"],
    ]);

    const result = WorkflowCanvasTopologicalStatusCap.applyCap({ workflow, statusByNodeId: input });

    expect(result["fan-in"]).toBe("completed");
  });

  it("multiple incoming branches with mixed states: fan-in shows least-progressed upstream", () => {
    // A → merge ← B, A=completed, B=queued, merge engine=completed
    const workflow = makeWorkflow(
      ["A", "B", "merge"],
      [
        { from: "A", to: "merge" },
        { from: "B", to: "merge" },
      ],
    );
    const input = statuses([
      ["A", "completed"],
      ["B", "queued"],
      ["merge", "completed"],
    ]);

    const result = WorkflowCanvasTopologicalStatusCap.applyCap({ workflow, statusByNodeId: input });

    // B is queued (rank 1, pre-terminal) → merge should be capped to queued
    expect(result["merge"]).toBe("queued");
  });

  it("upstream failed does NOT block downstream completion", () => {
    // A fails, B has no upstream from A (it's parallel), merge gets A+B
    // Actually test: A fails → merge should still display its engine status
    const workflow = makeWorkflow(["A", "merge"], [{ from: "A", to: "merge" }]);
    const input = statuses([
      ["A", "failed"],
      ["merge", "completed"],
    ]);

    const result = WorkflowCanvasTopologicalStatusCap.applyCap({ workflow, statusByNodeId: input });

    // failed is terminal (rank 4 ≥ TERMINAL_RANK=3) → does not block merge
    expect(result["merge"]).toBe("completed");
  });

  it("upstream skipped does NOT block downstream completion", () => {
    const workflow = makeWorkflow(["A", "B"], [{ from: "A", to: "B" }]);
    const input = statuses([
      ["A", "skipped"],
      ["B", "completed"],
    ]);

    const result = WorkflowCanvasTopologicalStatusCap.applyCap({ workflow, statusByNodeId: input });

    // skipped is terminal (rank 3) → B displays engine status
    expect(result["B"]).toBe("completed");
  });

  it("attachment edges (targetRole=languageModel) are ignored by the cap", () => {
    // workflow: agent → llm (attachment edge)
    // agent is running, llm engine says completed
    // cap should NOT treat agent as upstream of llm (attachment role)
    const workflow = makeWorkflow(["agent", "llm"], [{ from: "agent", to: "llm" }], { llm: "languageModel" });
    const input = statuses([
      ["agent", "running"],
      ["llm", "completed"],
    ]);

    const result = WorkflowCanvasTopologicalStatusCap.applyCap({ workflow, statusByNodeId: input });

    // llm has no sequential upstreams (attachment edge excluded) → displays engine status
    expect(result["llm"]).toBe("completed");
    expect(result["agent"]).toBe("running");
  });

  it("node with undefined engine status: stays undefined in output even if cap would block", () => {
    // A is running, B has no snapshot yet (undefined)
    const workflow = makeWorkflow(["A", "B"], [{ from: "A", to: "B" }]);
    const input = statuses([["A", "running"]]);
    // B is not in statusByNodeId at all

    const result = WorkflowCanvasTopologicalStatusCap.applyCap({ workflow, statusByNodeId: input });

    // B has undefined engine status → output must remain undefined (not fabricated)
    expect(result["B"]).toBeUndefined();
  });

  it("cycles in workflow graph: handled defensively without infinite loop", () => {
    // A → B → C → A (malformed cycle)
    const workflow = makeWorkflow(
      ["A", "B", "C"],
      [
        { from: "A", to: "B" },
        { from: "B", to: "C" },
        { from: "C", to: "A" },
      ],
    );
    const input = statuses([
      ["A", "running"],
      ["B", "completed"],
      ["C", "completed"],
    ]);

    // Should not throw or loop forever
    expect(() => WorkflowCanvasTopologicalStatusCap.applyCap({ workflow, statusByNodeId: input })).not.toThrow();
    const result = WorkflowCanvasTopologicalStatusCap.applyCap({ workflow, statusByNodeId: input });
    // All nodes are in the cycle; they get their engine status as fallback
    expect(result["A"]).toBe("running");
    expect(result["B"]).toBe("completed");
    expect(result["C"]).toBe("completed");
  });
});
