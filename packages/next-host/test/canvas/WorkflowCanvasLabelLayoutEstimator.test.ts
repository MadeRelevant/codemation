import { describe, expect, it } from "vitest";

import { WorkflowCanvasLabelLayoutEstimator } from "../../src/features/workflows/components/canvas/lib/WorkflowCanvasLabelLayoutEstimator";

describe("WorkflowCanvasLabelLayoutEstimator", () => {
  it("returns at least one line for empty or whitespace", () => {
    expect(WorkflowCanvasLabelLayoutEstimator.estimateLineCount("", 76, 12)).toBe(1);
    expect(WorkflowCanvasLabelLayoutEstimator.estimateLineCount("   ", 76, 12)).toBe(1);
  });

  it("wraps long labels to multiple lines", () => {
    const long =
      "Azure OCR + aggregate something something something something something something something something something";
    const lines = WorkflowCanvasLabelLayoutEstimator.estimateLineCount(long, 76, 12);
    expect(lines).toBeGreaterThan(1);
  });
});
