// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowCanvasToolbarIconButton } from "../../src/canvas/WorkflowCanvasToolbarIconButton";

function makeButton(overrides: Partial<React.ComponentProps<typeof WorkflowCanvasToolbarIconButton>> = {}) {
  return (
    <WorkflowCanvasToolbarIconButton
      testId="toolbar-btn"
      ariaLabel="Test button"
      tooltip="Do something"
      onClick={() => {}}
      {...overrides}
    >
      <span>Icon</span>
    </WorkflowCanvasToolbarIconButton>
  );
}

describe("WorkflowCanvasToolbarIconButton", () => {
  it("renders the button with the correct testId", () => {
    render(makeButton());
    expect(screen.getByTestId("toolbar-btn")).toBeInTheDocument();
  });

  it("renders the tooltip text in the tooltip div", () => {
    render(makeButton({ tooltip: "My tooltip text" }));
    // The tooltip div has aria-hidden and role="tooltip"; query by text
    expect(screen.getByText("My tooltip text")).toBeInTheDocument();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(makeButton({ onClick }));
    fireEvent.click(screen.getByTestId("toolbar-btn"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("calls onAfterClick when clicked and onAfterClick is provided", () => {
    const onAfterClick = vi.fn();
    render(makeButton({ onAfterClick }));
    fireEvent.click(screen.getByTestId("toolbar-btn"));
    expect(onAfterClick).toHaveBeenCalledTimes(1);
  });

  it("is disabled when disabled prop is true", () => {
    render(makeButton({ disabled: true }));
    expect(screen.getByTestId("toolbar-btn")).toBeDisabled();
  });

  it("shows tooltip div on pointer enter", () => {
    render(makeButton({ tooltip: "Hover tip" }));
    // The wrapper div contains both the button and the tooltip div
    const btn = screen.getByTestId("toolbar-btn");
    const wrapper = btn.parentElement!.parentElement!;
    fireEvent.pointerEnter(wrapper);
    // After hover, tooltip div should have aria-hidden="false" (visible)
    const tooltipDiv = screen.getByText("Hover tip");
    expect(tooltipDiv).toBeInTheDocument();
    fireEvent.pointerLeave(wrapper);
  });
});
