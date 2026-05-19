// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowActivationErrorDialog } from "../../src/panels/WorkflowActivationErrorDialog";

describe("WorkflowActivationErrorDialog", () => {
  it("does not render dialog content when open is false", () => {
    render(<WorkflowActivationErrorDialog open={false} alertLines={["Error occurred"]} onDismiss={() => {}} />);
    expect(screen.queryByTestId("workflow-activation-error-dialog")).toBeNull();
  });

  it("renders dialog content when open is true with a single alert line", () => {
    render(
      <WorkflowActivationErrorDialog open={true} alertLines={["Could not activate workflow"]} onDismiss={() => {}} />,
    );
    expect(screen.getByTestId("workflow-activation-error-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-activation-error-message").textContent).toBe("Could not activate workflow");
  });

  it("renders a list when alertLines has more than one entry", () => {
    render(<WorkflowActivationErrorDialog open={true} alertLines={["Error A", "Error B"]} onDismiss={() => {}} />);
    expect(screen.getByTestId("workflow-activation-error-list")).toBeInTheDocument();
    expect(screen.getByText("Error A")).toBeInTheDocument();
    expect(screen.getByText("Error B")).toBeInTheDocument();
  });

  it("calls onDismiss when OK button is clicked", () => {
    const onDismiss = vi.fn();
    render(<WorkflowActivationErrorDialog open={true} alertLines={["Some error"]} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByTestId("workflow-activation-error-dialog-ok"));
    expect(onDismiss).toHaveBeenCalled();
  });

  it("uses default title when title prop is omitted", () => {
    render(<WorkflowActivationErrorDialog open={true} alertLines={["error"]} onDismiss={() => {}} />);
    expect(screen.getByText("Could not update activation")).toBeInTheDocument();
  });

  it("uses custom title when title prop is provided", () => {
    render(
      <WorkflowActivationErrorDialog
        open={true}
        title="Custom activation error"
        alertLines={["error"]}
        onDismiss={() => {}}
      />,
    );
    expect(screen.getByText("Custom activation error")).toBeInTheDocument();
  });
});
