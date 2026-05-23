// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import {
  statusIconForNode,
  trailingIconForNode,
  trailingIconKindForNode,
} from "../../src/canvas/workflowCanvasNodeChrome";

describe("statusIconForNode", () => {
  it("returns a CircleCheckBig node for completed", () => {
    const icon = statusIconForNode("completed");
    expect(icon).not.toBeNull();
  });

  it("returns a CircleAlert node for failed", () => {
    const icon = statusIconForNode("failed");
    expect(icon).not.toBeNull();
  });

  it("returns a Clock3 node for skipped", () => {
    const icon = statusIconForNode("skipped");
    expect(icon).not.toBeNull();
  });

  it("returns null for running", () => {
    expect(statusIconForNode("running")).toBeNull();
  });

  it("returns null for queued", () => {
    expect(statusIconForNode("queued")).toBeNull();
  });

  it("returns null for pending", () => {
    expect(statusIconForNode("pending")).toBeNull();
  });

  it("returns null for undefined status", () => {
    expect(statusIconForNode(undefined)).toBeNull();
  });
});

describe("trailingIconForNode", () => {
  it("returns a pin icon when isPinned is true regardless of status", () => {
    const icon = trailingIconForNode({ status: "completed", isPinned: true });
    expect(icon).not.toBeNull();
  });

  it("returns status icon when not pinned and status is completed", () => {
    const icon = trailingIconForNode({ status: "completed", isPinned: false });
    expect(icon).not.toBeNull();
  });

  it("returns null when not pinned and status is running", () => {
    expect(trailingIconForNode({ status: "running", isPinned: false })).toBeNull();
  });

  it("returns null when not pinned and status is undefined", () => {
    expect(trailingIconForNode({ status: undefined, isPinned: false })).toBeNull();
  });
});

describe("trailingIconKindForNode", () => {
  it("returns 'pin' when isPinned is true", () => {
    expect(trailingIconKindForNode({ status: "completed", isPinned: true })).toBe("pin");
  });

  it("returns 'completed' when completed and not pinned", () => {
    expect(trailingIconKindForNode({ status: "completed", isPinned: false })).toBe("completed");
  });

  it("returns 'skipped' when skipped and not pinned", () => {
    expect(trailingIconKindForNode({ status: "skipped", isPinned: false })).toBe("skipped");
  });

  it("returns 'failed' when failed and not pinned", () => {
    expect(trailingIconKindForNode({ status: "failed", isPinned: false })).toBe("failed");
  });

  it("returns 'none' for running status", () => {
    expect(trailingIconKindForNode({ status: "running", isPinned: false })).toBe("none");
  });

  it("returns 'none' for undefined status", () => {
    expect(trailingIconKindForNode({ status: undefined, isPinned: false })).toBe("none");
  });

  it("returns 'none' for queued status", () => {
    expect(trailingIconKindForNode({ status: "queued", isPinned: false })).toBe("none");
  });
});
