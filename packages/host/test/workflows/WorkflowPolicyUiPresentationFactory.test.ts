import { describe, expect, it } from "vitest";
import { WorkflowPolicyUiPresentationFactory } from "../../src/application/mapping/WorkflowPolicyUiPresentationFactory";

describe("WorkflowPolicyUiPresentationFactory", () => {
  it("formats fixed retry summary", () => {
    const f = new WorkflowPolicyUiPresentationFactory();
    const s = f.nodeRetrySummary({
      retryPolicy: { kind: "fixed", maxAttempts: 3, delayMs: 10 },
    } as never);
    expect(s).toContain("3");
    expect(s).toContain("10");
  });

  it("detects node error handler flag", () => {
    const f = new WorkflowPolicyUiPresentationFactory();
    expect(f.snapshotNodeHasErrorHandler({ nodeErrorHandler: {} })).toBe(true);
    expect(f.snapshotNodeHasErrorHandler({})).toBe(false);
  });
});
