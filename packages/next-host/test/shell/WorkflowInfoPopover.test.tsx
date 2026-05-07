// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowInfoPopover } from "../../src/shell/WorkflowInfoPopover";
import { WorkflowInfoPopoverMetaRow } from "../../src/shell/WorkflowInfoPopoverMetaRow";

const baseWorkflow = {
  id: "wf.demo.example",
  name: "Demo Example",
  active: true,
  discoveryPathSegments: ["demo", "example"] as readonly string[],
} as const;

describe("WorkflowInfoPopoverMetaRow", () => {
  it("renders a label/value row with the provided strings", () => {
    render(<WorkflowInfoPopoverMetaRow label="ID" value="wf.demo.x" />);
    expect(screen.getByText("ID")).toBeDefined();
    expect(screen.getByText("wf.demo.x")).toBeDefined();
  });

  it("renders a ReactNode value (preserves children)", () => {
    render(<WorkflowInfoPopoverMetaRow label="Trigger" value={<span data-testid="custom-value">cron</span>} />);
    expect(screen.getByTestId("custom-value").textContent).toBe("cron");
  });
});

describe("WorkflowInfoPopover", () => {
  it("renders the info trigger button with accessible label", () => {
    render(<WorkflowInfoPopover workflow={baseWorkflow} triggerType="cron" />);
    const trigger = screen.getByTestId("workflow-info-popover-trigger");
    expect(trigger.getAttribute("aria-label")).toBe("Workflow information");
  });

  it("renders without crashing when discoveryPathSegments is empty (no Path row built)", () => {
    render(<WorkflowInfoPopover workflow={{ ...baseWorkflow, discoveryPathSegments: [] }} triggerType={undefined} />);
    expect(screen.getByTestId("workflow-info-popover-trigger")).toBeDefined();
  });

  it("opens the content panel and shows id, joined path, trigger and Active status when triggered", () => {
    render(<WorkflowInfoPopover workflow={baseWorkflow} triggerType="cron" />);
    fireEvent.click(screen.getByTestId("workflow-info-popover-trigger"));
    expect(screen.getByText(baseWorkflow.name)).toBeDefined();
    expect(screen.getByText(baseWorkflow.id)).toBeDefined();
    // Path row joins discovery segments with " / "
    expect(screen.getByText("demo / example")).toBeDefined();
    expect(screen.getByText("cron")).toBeDefined();
    expect(screen.getByText("Active")).toBeDefined();
  });

  it("renders Inactive status when workflow.active is false (open state)", () => {
    render(<WorkflowInfoPopover workflow={{ ...baseWorkflow, active: false }} triggerType={undefined} />);
    fireEvent.click(screen.getByTestId("workflow-info-popover-trigger"));
    expect(screen.getByText("Inactive")).toBeDefined();
  });
});
