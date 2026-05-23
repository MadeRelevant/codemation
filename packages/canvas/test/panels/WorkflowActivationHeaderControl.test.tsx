// @vitest-environment jsdom

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowActivationHeaderControl } from "../../src/panels/WorkflowActivationHeaderControl";

const BASE_PROPS = {
  active: false,
  pending: false,
  onActiveChange: () => {},
  alertLines: null,
  onDismissAlert: () => {},
};

describe("WorkflowActivationHeaderControl", () => {
  it("renders the activation control container", () => {
    render(<WorkflowActivationHeaderControl {...BASE_PROPS} />);
    expect(screen.getByTestId("workflow-activation-control")).toBeInTheDocument();
  });

  it("renders the switch", () => {
    render(<WorkflowActivationHeaderControl {...BASE_PROPS} />);
    expect(screen.getByTestId("workflow-activation-switch")).toBeInTheDocument();
  });

  it("shows pending spinner when pending is true", () => {
    render(<WorkflowActivationHeaderControl {...BASE_PROPS} pending />);
    expect(screen.getByTestId("workflow-activation-pending-indicator")).toBeInTheDocument();
  });

  it("does not show pending spinner when pending is false", () => {
    render(<WorkflowActivationHeaderControl {...BASE_PROPS} pending={false} />);
    expect(screen.queryByTestId("workflow-activation-pending-indicator")).toBeNull();
  });

  it("calls onActiveChange when switch is clicked", () => {
    const onActiveChange = vi.fn();
    render(<WorkflowActivationHeaderControl {...BASE_PROPS} onActiveChange={onActiveChange} />);
    fireEvent.click(screen.getByTestId("workflow-activation-switch"));
    expect(onActiveChange).toHaveBeenCalled();
  });

  it("does not render error dialog when alertLines is null", () => {
    render(<WorkflowActivationHeaderControl {...BASE_PROPS} alertLines={null} />);
    expect(screen.queryByTestId("workflow-activation-error-dialog")).toBeNull();
  });

  it("does not render error dialog when alertLines is empty array", () => {
    render(<WorkflowActivationHeaderControl {...BASE_PROPS} alertLines={[]} />);
    expect(screen.queryByTestId("workflow-activation-error-dialog")).toBeNull();
  });

  it("renders error dialog when alertLines has entries and showErrorAlert is default true", () => {
    render(<WorkflowActivationHeaderControl {...BASE_PROPS} alertLines={["Activation failed"]} />);
    expect(screen.getByTestId("workflow-activation-error-dialog")).toBeInTheDocument();
  });

  it("does not render error dialog when showErrorAlert is false even with alertLines", () => {
    render(
      <WorkflowActivationHeaderControl {...BASE_PROPS} alertLines={["Activation failed"]} showErrorAlert={false} />,
    );
    expect(screen.queryByTestId("workflow-activation-error-dialog")).toBeNull();
  });

  it("uses shell variant without border/backdrop styles when variant=shell", () => {
    render(<WorkflowActivationHeaderControl {...BASE_PROPS} variant="shell" />);
    const control = screen.getByTestId("workflow-activation-control");
    // shell variant doesn't have rounded-md/border classes
    expect(control.classList.contains("rounded-md")).toBe(false);
  });

  it("switch is disabled when pending is true", () => {
    render(<WorkflowActivationHeaderControl {...BASE_PROPS} pending />);
    const switchEl = screen.getByTestId("workflow-activation-switch");
    // Radix Switch renders with disabled attribute or aria-disabled
    expect(
      switchEl.hasAttribute("disabled") ||
        switchEl.getAttribute("aria-disabled") === "true" ||
        switchEl.getAttribute("data-disabled") !== null,
    ).toBe(true);
  });
});
