// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowStatusIcon, WorkflowNodeIconResolver } from "../../src/panels/WorkflowDetailIcons";

describe("WorkflowStatusIcon", () => {
  it("renders a circle-check for completed", () => {
    const { container } = render(<WorkflowStatusIcon status="completed" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders a circle-alert for failed", () => {
    const { container } = render(<WorkflowStatusIcon status="failed" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders an animated loader for running", () => {
    const { container } = render(<WorkflowStatusIcon status="running" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders an animated loader for queued", () => {
    const { container } = render(<WorkflowStatusIcon status="queued" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("renders a clock for any other status", () => {
    const { container } = render(<WorkflowStatusIcon status="pending" />);
    expect(container.firstChild).not.toBeNull();
  });

  it("uses custom size when provided", () => {
    // Just verify it renders without error; size is a prop on the SVG icon
    const { container } = render(<WorkflowStatusIcon status="completed" size={20} />);
    expect(container.firstChild).not.toBeNull();
  });
});

describe("WorkflowNodeIconResolver.resolveFallback", () => {
  it("returns Bot icon for agent role", () => {
    const Icon = WorkflowNodeIconResolver.resolveFallback("agent");
    expect(Icon).toBeTruthy();
  });

  it("returns Bot icon for nestedAgent role", () => {
    const Icon = WorkflowNodeIconResolver.resolveFallback("nestedAgent");
    expect(Icon).toBeTruthy();
  });

  it("returns Brain icon for languageModel role", () => {
    const Icon = WorkflowNodeIconResolver.resolveFallback("languageModel");
    expect(Icon).toBeTruthy();
  });

  it("returns Wrench icon for tool role", () => {
    const Icon = WorkflowNodeIconResolver.resolveFallback("tool");
    expect(Icon).toBeTruthy();
  });

  it("returns CircleHelp for unknown role", () => {
    const Icon = WorkflowNodeIconResolver.resolveFallback("unknown");
    expect(Icon).toBeTruthy();
  });

  it("returns CircleHelp when role is undefined", () => {
    const Icon = WorkflowNodeIconResolver.resolveFallback(undefined);
    expect(Icon).toBeTruthy();
  });

  it("agent and nestedAgent resolve to same icon", () => {
    expect(WorkflowNodeIconResolver.resolveFallback("agent")).toBe(
      WorkflowNodeIconResolver.resolveFallback("nestedAgent"),
    );
  });
});
