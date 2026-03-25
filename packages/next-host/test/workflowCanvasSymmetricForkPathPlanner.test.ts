import { describe, expect, it } from "vitest";

import { WorkflowCanvasSymmetricForkPathPlanner } from "../src/features/workflows/components/canvas/lib/WorkflowCanvasSymmetricForkPathPlanner";

describe("WorkflowCanvasSymmetricForkPathPlanner", () => {
  it("uses the same horizontal stub then vertical to target row (fork symmetry)", () => {
    const upper = WorkflowCanvasSymmetricForkPathPlanner.build({
      sourceX: 100,
      sourceY: 200,
      targetX: 320,
      targetY: 120,
      offset: 28,
    });
    expect(upper.path.startsWith("M100 200")).toBe(true);
    expect(upper.path).toContain("Q");
    expect(upper.path).toContain("320 120");

    const lower = WorkflowCanvasSymmetricForkPathPlanner.build({
      sourceX: 100,
      sourceY: 200,
      targetX: 320,
      targetY: 280,
      offset: 28,
    });
    expect(lower.path.startsWith("M100 200")).toBe(true);
    expect(lower.path).toContain("Q");
    expect(lower.path).toContain("320 280");
  });
});
