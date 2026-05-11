import { describe, expect, it } from "vitest";

import { WorkflowCanvasPortOrderResolver } from "@codemation/canvas";

describe("WorkflowCanvasPortOrderResolver", () => {
  it("orders source outputs with true above false", () => {
    expect(WorkflowCanvasPortOrderResolver.sortSourceOutputs(["false", "main", "true"])).toEqual([
      "true",
      "false",
      "main",
    ]);
  });

  it("orders merge inputs with true above false", () => {
    expect(WorkflowCanvasPortOrderResolver.sortTargetInputs(["in", "false", "true"])).toEqual(["true", "false", "in"]);
  });
});
