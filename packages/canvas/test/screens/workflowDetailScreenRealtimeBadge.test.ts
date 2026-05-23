// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { resolveWorkflowRealtimeBadge } from "../../src/screens/workflowDetailScreenRealtimeBadge";

describe("resolveWorkflowRealtimeBadge", () => {
  it('returns null for kind "ok"', () => {
    expect(resolveWorkflowRealtimeBadge({ kind: "ok" })).toBeNull();
  });

  it('returns errored badge for kind "errored"', () => {
    const result = resolveWorkflowRealtimeBadge({
      kind: "errored",
      message: "Unexpected token",
      file: "workflow.ts",
      line: 42,
    });
    expect(result).not.toBeNull();
    expect(result!.testId).toBe("workflow-realtime-build-failed-indicator");
    expect(result!.label).toContain("Build failed");
    expect(result!.label).toContain("workflow.ts:42");
    expect(result!.label).toContain("Unexpected token");
    expect(result!.className).toContain("destructive");
  });

  it("errored badge without file shows message without file:line part", () => {
    const result = resolveWorkflowRealtimeBadge({
      kind: "errored",
      message: "Parse error",
    });
    expect(result).not.toBeNull();
    expect(result!.label).toContain("Build failed");
    expect(result!.label).toContain("Parse error");
    expect(result!.label).not.toContain("undefined");
  });

  it('returns disconnected badge for kind "disconnected"', () => {
    const result = resolveWorkflowRealtimeBadge({ kind: "disconnected" });
    expect(result).not.toBeNull();
    expect(result!.testId).toBe("workflow-realtime-disconnected-indicator");
    expect(result!.label).toContain("disconnected");
    expect(result!.className).toContain("amber");
  });

  it('returns reloading badge for kind "reloading"', () => {
    const result = resolveWorkflowRealtimeBadge({ kind: "reloading" });
    expect(result).not.toBeNull();
    expect(result!.testId).toBe("workflow-realtime-reloading-indicator");
    expect(result!.label).toContain("Reloading");
  });
});
