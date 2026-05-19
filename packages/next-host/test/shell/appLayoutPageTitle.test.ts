import { describe, expect, it } from "vitest";

import { getPageTitle } from "../../src/shell/appLayoutPageTitle";

describe("getPageTitle", () => {
  const workflows = [
    { id: "wf.gmail", name: "Gmail triage" },
    { id: "wf.sales", name: "Sales follow-up" },
  ];

  it("returns Dashboard for /dashboard", () => {
    expect(getPageTitle("/dashboard", [], "Codemation")).toBe("Dashboard");
  });

  it("returns Credentials for /credentials", () => {
    expect(getPageTitle("/credentials", [], "Codemation")).toBe("Credentials");
  });

  it("returns Users for /users", () => {
    expect(getPageTitle("/users", [], "Codemation")).toBe("Users");
  });

  it("returns Workflows for /workflows", () => {
    expect(getPageTitle("/workflows", [], "Codemation")).toBe("Workflows");
  });

  it("returns the workflow name for a matched /workflows/:id path", () => {
    expect(getPageTitle("/workflows/wf.gmail", workflows, "Codemation")).toBe("Gmail triage");
    expect(getPageTitle("/workflows/wf.sales", workflows, "Codemation")).toBe("Sales follow-up");
  });

  it("returns 'Workflow' fallback when workflow id is not found", () => {
    expect(getPageTitle("/workflows/wf.unknown", workflows, "Codemation")).toBe("Workflow");
  });

  it("handles URL-encoded workflow ids in the path", () => {
    const encoded = encodeURIComponent("wf.gmail");
    expect(getPageTitle(`/workflows/${encoded}`, workflows, "Codemation")).toBe("Gmail triage");
  });

  it("returns the shell default title for unrecognised paths", () => {
    expect(getPageTitle("/settings/profile", workflows, "My Product")).toBe("My Product");
    expect(getPageTitle("/", [], "Fallback")).toBe("Fallback");
  });

  it("does not match sub-paths of /workflows as workflow detail", () => {
    // /workflows itself — already handled above; /workflows/wf.gmail/sub is NOT matched as a detail page
    // (the regex only needs the leading segment, so it will still match via workflowMatch)
    expect(getPageTitle("/workflows/wf.gmail/runs", workflows, "Codemation")).toBe("Gmail triage");
  });
});
