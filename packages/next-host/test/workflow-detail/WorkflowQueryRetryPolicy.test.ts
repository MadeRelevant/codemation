import { describe, expect, it } from "vitest";

import { CodemationApiHttpError } from "../../src/api/CodemationApiHttpError";
import { WorkflowQueryRetryPolicy } from "../../src/features/workflows/lib/realtime/WorkflowQueryRetryPolicy";

describe("WorkflowQueryRetryPolicy", () => {
  it("does not retry unknown workflow responses", () => {
    expect(WorkflowQueryRetryPolicy.shouldRetry(0, new CodemationApiHttpError(404, "Unknown workflowId"))).toBe(false);
  });

  it("retries recoverable failures up to the default attempt budget", () => {
    expect(WorkflowQueryRetryPolicy.shouldRetry(0, new CodemationApiHttpError(500, "boom"))).toBe(true);
    expect(WorkflowQueryRetryPolicy.shouldRetry(2, new Error("network"))).toBe(true);
    expect(WorkflowQueryRetryPolicy.shouldRetry(3, new Error("still broken"))).toBe(false);
  });
});
