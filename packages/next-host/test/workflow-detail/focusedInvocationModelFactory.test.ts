import { describe, expect, it } from "vitest";
import type { ConnectionInvocationRecord } from "../../src/features/workflows/hooks/realtime/realtime";
import { FocusedInvocationModelFactory } from "../../src/features/workflows/lib/workflowDetail/FocusedInvocationModelFactory";

const BASE_RUN_ID = "run_focus_test";
const BASE_WORKFLOW_ID = "wf.focus_test";
const NODE_ID = "AIAgentNode$1:1__conn__llm";

function makeInvocation(
  invocationId: string,
  parentAgentActivationId: string | undefined,
  startedAt: string,
): ConnectionInvocationRecord {
  return {
    invocationId,
    runId: BASE_RUN_ID,
    workflowId: BASE_WORKFLOW_ID,
    connectionNodeId: NODE_ID,
    parentAgentNodeId: "agent_main",
    parentAgentActivationId: parentAgentActivationId as string,
    status: "completed",
    startedAt,
    updatedAt: startedAt,
  };
}

describe("FocusedInvocationModelFactory (focused item mode)", () => {
  describe("create", () => {
    it("returns undefined when focusedInvocationId is not in nodeInvocations", () => {
      const invocations = [makeInvocation("inv_a1", "act_a", "2026-01-01T00:00:00.000Z")];
      const result = FocusedInvocationModelFactory.create({
        nodeInvocations: invocations,
        focusedInvocationId: "inv_not_here",
      });
      expect(result).toBeUndefined();
    });

    it("returns undefined for empty nodeInvocations", () => {
      const result = FocusedInvocationModelFactory.create({
        nodeInvocations: [],
        focusedInvocationId: "inv_a1",
      });
      expect(result).toBeUndefined();
    });

    it("focusing on any invocation in item A returns ALL invocations of item A as the bucket", () => {
      const invA1 = makeInvocation("inv_a1", "act_a", "2026-01-01T00:00:00.000Z");
      const invA2 = makeInvocation("inv_a2", "act_a", "2026-01-01T00:00:02.000Z");
      const invB1 = makeInvocation("inv_b1", "act_b", "2026-01-01T00:00:10.000Z");

      const result = FocusedInvocationModelFactory.create({
        nodeInvocations: [invA1, invA2, invB1],
        focusedInvocationId: "inv_a2",
      });

      expect(result).toBeDefined();
      expect(result?.itemNumber).toBe(1);
      expect(result?.totalItems).toBe(2);
      expect(result?.itemInvocations.map((inv) => inv.invocationId)).toEqual(["inv_a1", "inv_a2"]);
      expect(result?.prevItemFirstInvocationId).toBeNull();
      expect(result?.nextItemFirstInvocationId).toBe("inv_b1");
    });

    it("prev/next item navigation jumps to the FIRST invocation of the neighbouring item", () => {
      const invA1 = makeInvocation("inv_a1", "act_a", "2026-01-01T00:00:00.000Z");
      const invA2 = makeInvocation("inv_a2", "act_a", "2026-01-01T00:00:02.000Z");
      const invB1 = makeInvocation("inv_b1", "act_b", "2026-01-01T00:00:10.000Z");
      const invB2 = makeInvocation("inv_b2", "act_b", "2026-01-01T00:00:11.000Z");

      const result = FocusedInvocationModelFactory.create({
        nodeInvocations: [invA1, invA2, invB1, invB2],
        focusedInvocationId: "inv_b2",
      });

      expect(result?.itemNumber).toBe(2);
      expect(result?.totalItems).toBe(2);
      expect(result?.prevItemFirstInvocationId).toBe("inv_a1");
      expect(result?.nextItemFirstInvocationId).toBeNull();
    });

    it("single-item single-invocation: totalItems=1 and both prev/next are null", () => {
      const inv = makeInvocation("inv_solo", "act_solo", "2026-01-01T00:00:00.000Z");

      const result = FocusedInvocationModelFactory.create({
        nodeInvocations: [inv],
        focusedInvocationId: "inv_solo",
      });

      expect(result).toBeDefined();
      expect(result?.itemNumber).toBe(1);
      expect(result?.totalItems).toBe(1);
      expect(result?.itemInvocations).toHaveLength(1);
      expect(result?.prevItemFirstInvocationId).toBeNull();
      expect(result?.nextItemFirstInvocationId).toBeNull();
    });

    it("undefined activationIds share one bucket (not split into separate items)", () => {
      const inv1 = makeInvocation("inv_u1", undefined, "2026-01-01T00:00:00.000Z");
      const inv2 = makeInvocation("inv_u2", undefined, "2026-01-01T00:00:02.000Z");

      const result = FocusedInvocationModelFactory.create({
        nodeInvocations: [inv1, inv2],
        focusedInvocationId: "inv_u2",
      });

      expect(result?.totalItems).toBe(1);
      expect(result?.itemNumber).toBe(1);
      expect(result?.itemInvocations.map((inv) => inv.invocationId)).toEqual(["inv_u1", "inv_u2"]);
    });

    it("itemInvocations are returned sorted by start time even when input is shuffled", () => {
      const inv1 = makeInvocation("inv_a1", "act_a", "2026-01-01T00:00:00.000Z");
      const inv2 = makeInvocation("inv_a2", "act_a", "2026-01-01T00:00:02.000Z");
      const inv3 = makeInvocation("inv_a3", "act_a", "2026-01-01T00:00:03.000Z");

      const result = FocusedInvocationModelFactory.create({
        nodeInvocations: [inv3, inv1, inv2],
        focusedInvocationId: "inv_a1",
      });

      expect(result?.itemInvocations.map((inv) => inv.invocationId)).toEqual(["inv_a1", "inv_a2", "inv_a3"]);
    });

    it("sorts items by itemIndex first, then by earliest start time", () => {
      const invA: ConnectionInvocationRecord = {
        ...makeInvocation("inv_a1", "act_a", "2026-01-01T00:00:10.000Z"),
        itemIndex: 1,
      };
      const invB: ConnectionInvocationRecord = {
        ...makeInvocation("inv_b1", "act_b", "2026-01-01T00:00:00.000Z"),
        itemIndex: 0,
      };

      const result = FocusedInvocationModelFactory.create({
        nodeInvocations: [invA, invB],
        focusedInvocationId: "inv_a1",
      });

      expect(result?.totalItems).toBe(2);
      // invB has itemIndex 0 → item 1; invA has itemIndex 1 → item 2
      expect(result?.itemNumber).toBe(2);
      expect(result?.prevItemFirstInvocationId).toBe("inv_b1");
    });
  });
});
