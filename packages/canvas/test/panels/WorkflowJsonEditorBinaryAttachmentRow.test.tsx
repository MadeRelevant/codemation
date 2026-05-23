// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowJsonEditorBinaryAttachmentRow } from "../../src/panels/WorkflowJsonEditorBinaryAttachmentRow";

const BASE_ATTACHMENT = {
  id: "att-1",
  name: "file.pdf",
  mimeType: "application/pdf",
  sizeBytes: 1024,
};

const BASE_PROPS = {
  workflowId: "wf-1",
  itemIndex: 0,
  name: "document",
  attachment: BASE_ATTACHMENT,
  uploadBusyKey: null,
  onReplace: vi.fn(),
  onRemove: vi.fn(),
};

describe("WorkflowJsonEditorBinaryAttachmentRow", () => {
  it("renders with the given attachment name", () => {
    render(<WorkflowJsonEditorBinaryAttachmentRow {...BASE_PROPS} />);
    expect(screen.getByTestId("workflow-json-editor-binary-row-0-document")).toBeInTheDocument();
    expect(screen.getByText("document")).toBeInTheDocument();
  });

  it("renders an Open link", () => {
    render(<WorkflowJsonEditorBinaryAttachmentRow {...BASE_PROPS} />);
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("renders a Replace button", () => {
    render(<WorkflowJsonEditorBinaryAttachmentRow {...BASE_PROPS} />);
    expect(screen.getByText("Replace")).toBeInTheDocument();
  });

  it("renders a Remove button", () => {
    render(<WorkflowJsonEditorBinaryAttachmentRow {...BASE_PROPS} />);
    expect(screen.getByTestId("workflow-json-editor-binary-remove-0-document")).toBeInTheDocument();
  });

  it("calls onRemove when Remove button is clicked", () => {
    const onRemove = vi.fn();
    render(<WorkflowJsonEditorBinaryAttachmentRow {...BASE_PROPS} onRemove={onRemove} />);
    fireEvent.click(screen.getByTestId("workflow-json-editor-binary-remove-0-document"));
    expect(onRemove).toHaveBeenCalled();
  });

  it("disables Replace button when uploadBusyKey is set", () => {
    render(<WorkflowJsonEditorBinaryAttachmentRow {...BASE_PROPS} uploadBusyKey="busy-key" />);
    expect(screen.getByText("Replace")).toBeDisabled();
  });

  it("enables Replace button when uploadBusyKey is null", () => {
    render(<WorkflowJsonEditorBinaryAttachmentRow {...BASE_PROPS} uploadBusyKey={null} />);
    expect(screen.getByText("Replace")).not.toBeDisabled();
  });

  it("renders hidden file input for replace", () => {
    const { container } = render(<WorkflowJsonEditorBinaryAttachmentRow {...BASE_PROPS} />);
    const fileInput = container.querySelector(
      `[data-testid="workflow-json-editor-binary-replace-0-document"]`,
    ) as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    expect(fileInput.type).toBe("file");
  });

  it("calls onReplace with the selected file when file input changes", () => {
    const onReplace = vi.fn();
    const { container } = render(<WorkflowJsonEditorBinaryAttachmentRow {...BASE_PROPS} onReplace={onReplace} />);
    const fileInput = container.querySelector(
      '[data-testid="workflow-json-editor-binary-replace-0-document"]',
    ) as HTMLInputElement;
    const file = new File(["content"], "test.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);
    expect(onReplace).toHaveBeenCalledWith(file);
  });

  it("does not call onReplace when file input change has no file", () => {
    const onReplace = vi.fn();
    const { container } = render(<WorkflowJsonEditorBinaryAttachmentRow {...BASE_PROPS} onReplace={onReplace} />);
    const fileInput = container.querySelector(
      '[data-testid="workflow-json-editor-binary-replace-0-document"]',
    ) as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [], configurable: true });
    fireEvent.change(fileInput);
    expect(onReplace).not.toHaveBeenCalled();
  });
});
