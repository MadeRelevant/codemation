import { describe, expect, it } from "vitest";

import { WorkflowCanvasOverlapResolver } from "../src/features/workflows/components/canvas/lib/WorkflowCanvasOverlapResolver";

describe("WorkflowCanvasOverlapResolver", () => {
  it("separates two nodes that share the same center", () => {
    const positionsByNodeId = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 0, y: 0 }],
    ]);
    const widthByNodeId = new Map([
      ["a", 100],
      ["b", 100],
    ]);
    const heightByNodeId = new Map([
      ["a", 50],
      ["b", 50],
    ]);
    const resolved = WorkflowCanvasOverlapResolver.resolve({
      positionsByNodeId,
      widthByNodeId,
      heightByNodeId,
      gap: 10,
    });
    const pa = resolved.get("a");
    const pb = resolved.get("b");
    expect(pa).toBeDefined();
    expect(pb).toBeDefined();
    expect(pa).not.toEqual(pb);
    const minDy = (50 + 50) / 2 + 10;
    expect(Math.abs(pa!.y - pb!.y)).toBeGreaterThanOrEqual(minDy - 0.01);
  });

  it("leaves non-overlapping nodes unchanged when already satisfied", () => {
    const positionsByNodeId = new Map([
      ["a", { x: 0, y: 0 }],
      ["b", { x: 0, y: 200 }],
    ]);
    const widthByNodeId = new Map([
      ["a", 100],
      ["b", 100],
    ]);
    const heightByNodeId = new Map([
      ["a", 50],
      ["b", 50],
    ]);
    const resolved = WorkflowCanvasOverlapResolver.resolve({
      positionsByNodeId,
      widthByNodeId,
      heightByNodeId,
      gap: 10,
    });
    expect(resolved.get("a")).toEqual({ x: 0, y: 0 });
    expect(resolved.get("b")).toEqual({ x: 0, y: 200 });
  });
});
