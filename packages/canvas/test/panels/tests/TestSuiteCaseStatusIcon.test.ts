// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { resolveDisplayedCaseStatus } from "../../../src/panels/tests/TestSuiteCaseStatusIcon";
import type { TestSuiteChildRunDto } from "@codemation/host/dto";

function makeRun(overrides: Partial<TestSuiteChildRunDto>): TestSuiteChildRunDto {
  return {
    runId: "run-1",
    testSuiteRunId: "suite-1",
    testCaseIndex: 0,
    status: "completed",
    startedAt: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("resolveDisplayedCaseStatus", () => {
  it("uses testCaseStatus when present, regardless of engine status", () => {
    const run = makeRun({ status: "completed", testCaseStatus: "succeeded" });
    expect(resolveDisplayedCaseStatus(run)).toBe("succeeded");
  });

  it("uses testCaseStatus failed when engine says completed", () => {
    const run = makeRun({ status: "completed", testCaseStatus: "failed" });
    expect(resolveDisplayedCaseStatus(run)).toBe("failed");
  });

  it("uses testCaseStatus errored", () => {
    const run = makeRun({ status: "completed", testCaseStatus: "errored" });
    expect(resolveDisplayedCaseStatus(run)).toBe("errored");
  });

  it("uses testCaseStatus cancelled", () => {
    const run = makeRun({ status: "completed", testCaseStatus: "cancelled" });
    expect(resolveDisplayedCaseStatus(run)).toBe("cancelled");
  });

  it("uses testCaseStatus running", () => {
    const run = makeRun({ status: "running", testCaseStatus: "running" });
    expect(resolveDisplayedCaseStatus(run)).toBe("running");
  });

  it("maps engine pending → queued when testCaseStatus absent", () => {
    const run = makeRun({ status: "pending", testCaseStatus: undefined });
    expect(resolveDisplayedCaseStatus(run)).toBe("queued");
  });

  it("maps engine running → running when testCaseStatus absent", () => {
    const run = makeRun({ status: "running", testCaseStatus: undefined });
    expect(resolveDisplayedCaseStatus(run)).toBe("running");
  });

  it("maps engine completed → completed (legacy fallback) when testCaseStatus absent", () => {
    const run = makeRun({ status: "completed", testCaseStatus: undefined });
    expect(resolveDisplayedCaseStatus(run)).toBe("completed");
  });

  it("maps engine failed → failed when testCaseStatus absent", () => {
    const run = makeRun({ status: "failed", testCaseStatus: undefined });
    expect(resolveDisplayedCaseStatus(run)).toBe("failed");
  });

  it("maps unknown engine status → queued when testCaseStatus absent", () => {
    // Cast to force an unhandled status through the default branch
    const run = makeRun({ status: "unknown" as TestSuiteChildRunDto["status"], testCaseStatus: undefined });
    expect(resolveDisplayedCaseStatus(run)).toBe("queued");
  });
});
