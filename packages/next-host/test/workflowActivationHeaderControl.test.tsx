// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowActivationHeaderControl } from "../src/features/workflows/components/workflowDetail/WorkflowActivationHeaderControl";

describe("WorkflowActivationHeaderControl", () => {
  it("reflects active state on the switch", () => {
    const { rerender } = render(
      <WorkflowActivationHeaderControl
        active={false}
        pending={false}
        onActiveChange={() => {}}
        alertLines={null}
        onDismissAlert={() => {}}
      />,
    );
    expect(screen.getByTestId("workflow-activation-switch")).toHaveAttribute("data-state", "unchecked");

    rerender(
      <WorkflowActivationHeaderControl
        active={true}
        pending={false}
        onActiveChange={() => {}}
        alertLines={null}
        onDismissAlert={() => {}}
      />,
    );
    expect(screen.getByTestId("workflow-activation-switch")).toHaveAttribute("data-state", "checked");
  });

  it("shows a progress indicator while the request is pending", () => {
    render(
      <WorkflowActivationHeaderControl
        active={false}
        pending={true}
        onActiveChange={() => {}}
        alertLines={null}
        onDismissAlert={() => {}}
      />,
    );
    expect(screen.getByTestId("workflow-activation-pending-indicator")).toBeInTheDocument();
  });

  it("renders a single validation message as plain text and can dismiss the dialog", () => {
    const onDismiss = vi.fn();
    render(
      <WorkflowActivationHeaderControl
        active={false}
        pending={false}
        onActiveChange={() => {}}
        alertLines={["Only one issue"]}
        onDismissAlert={onDismiss}
      />,
    );
    const message = screen.getByTestId("workflow-activation-error-message");
    expect(message.textContent).toContain("Only one issue");
    expect(screen.queryByTestId("workflow-activation-error-list")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("workflow-activation-error-dialog-ok"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders multiple validation messages as a bullet list and can dismiss the dialog", () => {
    const onDismiss = vi.fn();
    render(
      <WorkflowActivationHeaderControl
        active={false}
        pending={false}
        onActiveChange={() => {}}
        alertLines={["First problem", "Second problem"]}
        onDismissAlert={onDismiss}
      />,
    );
    const list = screen.getByTestId("workflow-activation-error-list");
    expect(list.textContent).toContain("First problem");
    expect(list.textContent).toContain("Second problem");
    fireEvent.click(screen.getByTestId("workflow-activation-error-dialog-ok"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("notifies when the user toggles activation", () => {
    const onActiveChange = vi.fn();
    render(
      <WorkflowActivationHeaderControl
        active={false}
        pending={false}
        onActiveChange={onActiveChange}
        alertLines={null}
        onDismissAlert={() => {}}
      />,
    );
    fireEvent.click(screen.getByTestId("workflow-activation-switch"));
    expect(onActiveChange).toHaveBeenCalledWith(true);
  });
});
