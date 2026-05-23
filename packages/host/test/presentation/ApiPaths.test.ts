import { describe, expect, it } from "vitest";
import { ApiPaths } from "../../src/presentation/http/ApiPaths";

describe("ApiPaths", () => {
  it("workflows returns base path", () => {
    expect(ApiPaths.workflows()).toBe("/api/workflows");
  });

  it("workflow encodes workflowId", () => {
    expect(ApiPaths.workflow("my/workflow")).toBe("/api/workflows/my%2Fworkflow");
  });

  it("workflowRuns includes workflowId", () => {
    expect(ApiPaths.workflowRuns("wf-1")).toBe("/api/workflows/wf-1/runs");
  });

  it("workflowTestSuiteRuns includes workflowId", () => {
    expect(ApiPaths.workflowTestSuiteRuns("wf-1")).toBe("/api/workflows/wf-1/test-suite-runs");
  });

  it("workflowAssertionMetricTrends with no names returns base", () => {
    expect(ApiPaths.workflowAssertionMetricTrends("wf-1")).toBe("/api/workflows/wf-1/assertion-metric-trends");
  });

  it("workflowAssertionMetricTrends with empty names returns base", () => {
    expect(ApiPaths.workflowAssertionMetricTrends("wf-1", [])).toBe("/api/workflows/wf-1/assertion-metric-trends");
  });

  it("workflowAssertionMetricTrends with names appends encoded query", () => {
    const path = ApiPaths.workflowAssertionMetricTrends("wf-1", ["check1", "check 2"]);
    expect(path).toContain("names=check1");
    expect(path).toContain("check%202");
  });

  it("testSuiteRun encodes testSuiteRunId", () => {
    expect(ApiPaths.testSuiteRun("ts/1")).toBe("/api/test-suite-runs/ts%2F1");
  });

  it("testSuiteRunAssertions returns assertions path", () => {
    expect(ApiPaths.testSuiteRunAssertions("ts-1")).toBe("/api/test-suite-runs/ts-1/assertions");
  });

  it("testSuiteRunChildRuns returns runs path", () => {
    expect(ApiPaths.testSuiteRunChildRuns("ts-1")).toBe("/api/test-suite-runs/ts-1/runs");
  });

  it("runAssertions includes runId", () => {
    expect(ApiPaths.runAssertions("run-1")).toBe("/api/runs/run-1/assertions");
  });

  it("run returns runs base path", () => {
    expect(ApiPaths.run()).toBe("/api/runs");
  });

  it("runs returns runs path", () => {
    expect(ApiPaths.runs()).toBe("/api/runs");
  });

  it("runState encodes runId", () => {
    expect(ApiPaths.runState("run/1")).toBe("/api/runs/run%2F1");
  });

  it("runDetail includes /detail", () => {
    expect(ApiPaths.runDetail("run-1")).toBe("/api/runs/run-1/detail");
  });

  it("runWorkflowSnapshot includes /workflow-snapshot", () => {
    expect(ApiPaths.runWorkflowSnapshot("run-1")).toBe("/api/runs/run-1/workflow-snapshot");
  });

  it("runNodePin encodes nodeId", () => {
    expect(ApiPaths.runNodePin("run-1", "node/1")).toBe("/api/runs/run-1/nodes/node%2F1/pin");
  });

  it("runNode encodes nodeId", () => {
    expect(ApiPaths.runNode("run-1", "node/1")).toBe("/api/runs/run-1/nodes/node%2F1/run");
  });

  it("runBinaryContent encodes binaryId", () => {
    expect(ApiPaths.runBinaryContent("run-1", "bin/1")).toBe("/api/runs/run-1/binary/bin%2F1/content");
  });

  it("telemetryDashboardSummary returns correct path", () => {
    expect(ApiPaths.telemetryDashboardSummary()).toBe("/api/telemetry/dashboard/summary");
  });

  it("telemetryDashboardTimeseries returns correct path", () => {
    expect(ApiPaths.telemetryDashboardTimeseries()).toBe("/api/telemetry/dashboard/timeseries");
  });

  it("telemetryDashboardDimensions returns correct path", () => {
    expect(ApiPaths.telemetryDashboardDimensions()).toBe("/api/telemetry/dashboard/dimensions");
  });

  it("telemetryDashboardRuns returns correct path", () => {
    expect(ApiPaths.telemetryDashboardRuns()).toBe("/api/telemetry/dashboard/runs");
  });

  it("telemetryRunTrace returns trace path with runId", () => {
    expect(ApiPaths.telemetryRunTrace("run-1")).toBe("/api/telemetry/runs/run-1/trace");
  });

  it("devGatewayNotify returns notify endpoint", () => {
    expect(ApiPaths.devGatewayNotify()).toBe("/api/dev/notify");
  });

  it("authOAuthStart with callbackUrl appends query", () => {
    const path = ApiPaths.authOAuthStart("github", "http://localhost/callback");
    expect(path).toContain("callbackUrl=");
    expect(path).toContain("github");
  });

  it("authOAuthStart without callbackUrl returns base", () => {
    expect(ApiPaths.authOAuthStart("github")).toBe("/api/auth/oauth/github/start");
  });

  it("authOAuthCallback includes providerId", () => {
    expect(ApiPaths.authOAuthCallback("github")).toBe("/api/auth/oauth/github/callback");
  });

  it("runDetail path is correct", () => {
    expect(ApiPaths.runDetail("run-123")).toBe("/api/runs/run-123/detail");
  });

  // User management paths — not covered by existing tests
  it("authLogin returns /api/auth/login", () => {
    expect(ApiPaths.authLogin()).toBe("/api/auth/login");
  });

  it("authLogout returns /api/auth/logout", () => {
    expect(ApiPaths.authLogout()).toBe("/api/auth/logout");
  });

  it("authSession returns /api/auth/session", () => {
    expect(ApiPaths.authSession()).toBe("/api/auth/session");
  });

  it("userInviteVerify returns invites/verify path", () => {
    expect(ApiPaths.userInviteVerify()).toBe("/api/users/invites/verify");
  });

  it("userInviteAccept returns invites/accept path", () => {
    expect(ApiPaths.userInviteAccept()).toBe("/api/users/invites/accept");
  });

  it("userInvites returns /api/users/invites", () => {
    expect(ApiPaths.userInvites()).toBe("/api/users/invites");
  });

  it("userInviteRegenerate encodes userId", () => {
    expect(ApiPaths.userInviteRegenerate("u/1")).toBe("/api/users/u%2F1/invites/regenerate");
  });

  it("userStatus encodes userId", () => {
    expect(ApiPaths.userStatus("u/1")).toBe("/api/users/u%2F1/status");
  });

  it("whitelabelLogo returns /api/whitelabel/logo", () => {
    expect(ApiPaths.whitelabelLogo()).toBe("/api/whitelabel/logo");
  });

  it("frontendBootstrap returns /api/bootstrap/frontend", () => {
    expect(ApiPaths.frontendBootstrap()).toBe("/api/bootstrap/frontend");
  });

  it("internalAuthBootstrap returns /api/bootstrap/auth/internal", () => {
    expect(ApiPaths.internalAuthBootstrap()).toBe("/api/bootstrap/auth/internal");
  });

  it("workflowCredentialHealth includes credential-health", () => {
    expect(ApiPaths.workflowCredentialHealth("wf-1")).toBe("/api/workflows/wf-1/credential-health");
  });

  it("workflowDebuggerOverlay includes debugger-overlay", () => {
    expect(ApiPaths.workflowDebuggerOverlay("wf-1")).toBe("/api/workflows/wf-1/debugger-overlay");
  });

  it("workflowDebuggerOverlayCopyRun includes copy-run", () => {
    expect(ApiPaths.workflowDebuggerOverlayCopyRun("wf-1")).toContain("copy-run");
  });

  it("workflowDebuggerOverlayBinaryUpload includes binary upload path", () => {
    expect(ApiPaths.workflowDebuggerOverlayBinaryUpload("wf-1")).toContain("binary");
  });

  it("workflowOverlayBinaryContent includes binaryId", () => {
    expect(ApiPaths.workflowOverlayBinaryContent("wf-1", "b/1")).toContain("b%2F1");
  });

  it("workflowActivation includes activation", () => {
    expect(ApiPaths.workflowActivation("wf-1")).toBe("/api/workflows/wf-1/activation");
  });

  it("collections returns /api/collections", () => {
    expect(ApiPaths.collections()).toBe("/api/collections");
  });

  it("collection encodes name with spaces", () => {
    expect(ApiPaths.collection("my items")).toBe("/api/collections/my%20items");
  });

  it("collectionRows includes /rows", () => {
    expect(ApiPaths.collectionRows("users")).toBe("/api/collections/users/rows");
  });

  it("collectionRow encodes name and id", () => {
    expect(ApiPaths.collectionRow("my items", "row 1")).toBe("/api/collections/my%20items/rows/row%201");
  });

  it("syncCollections returns /api/collections/sync", () => {
    expect(ApiPaths.syncCollections()).toBe("/api/collections/sync");
  });
});
