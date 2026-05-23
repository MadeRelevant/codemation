// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { WorkflowJsonEditorBinaryUploadRow } from "../../src/panels/WorkflowJsonEditorBinaryUploadRow";

describe("WorkflowJsonEditorBinaryUploadRow", () => {
  it("renders the attachment name label and input", () => {
    render(<WorkflowJsonEditorBinaryUploadRow itemIndex={0} suggestName="file" busyKey={null} onUpload={vi.fn()} />);
    expect(screen.getByTestId("workflow-json-editor-binary-name-0")).toBeInTheDocument();
    expect(screen.getByLabelText("Attachment name")).toBeInTheDocument();
  });

  it("renders the Upload button", () => {
    render(<WorkflowJsonEditorBinaryUploadRow itemIndex={1} suggestName="file" busyKey={null} onUpload={vi.fn()} />);
    expect(screen.getByText("Upload")).toBeInTheDocument();
  });

  it("disables Upload button when busyKey is set", () => {
    render(
      <WorkflowJsonEditorBinaryUploadRow itemIndex={0} suggestName="file" busyKey="some-busy-key" onUpload={vi.fn()} />,
    );
    expect(screen.getByText("Upload")).toBeDisabled();
  });

  it("disables Upload button when name is empty after trimming", () => {
    render(<WorkflowJsonEditorBinaryUploadRow itemIndex={0} suggestName="" busyKey={null} onUpload={vi.fn()} />);
    expect(screen.getByText("Upload")).toBeDisabled();
  });

  it("enables Upload button when name is set and busyKey is null", () => {
    render(<WorkflowJsonEditorBinaryUploadRow itemIndex={0} suggestName="file" busyKey={null} onUpload={vi.fn()} />);
    expect(screen.getByText("Upload")).not.toBeDisabled();
  });

  it("updates name field when user types", () => {
    render(<WorkflowJsonEditorBinaryUploadRow itemIndex={0} suggestName="file" busyKey={null} onUpload={vi.fn()} />);
    const nameInput = screen.getByTestId("workflow-json-editor-binary-name-0") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "my-doc" } });
    expect(nameInput.value).toBe("my-doc");
  });

  it("updates suggestName when prop changes (via useEffect)", () => {
    const { rerender } = render(
      <WorkflowJsonEditorBinaryUploadRow itemIndex={0} suggestName="file" busyKey={null} onUpload={vi.fn()} />,
    );
    rerender(
      <WorkflowJsonEditorBinaryUploadRow itemIndex={0} suggestName="file_2" busyKey={null} onUpload={vi.fn()} />,
    );
    const nameInput = screen.getByTestId("workflow-json-editor-binary-name-0") as HTMLInputElement;
    expect(nameInput.value).toBe("file_2");
  });

  it("renders hidden file input for upload", () => {
    const { container } = render(
      <WorkflowJsonEditorBinaryUploadRow itemIndex={2} suggestName="file" busyKey={null} onUpload={vi.fn()} />,
    );
    const fileInput = container.querySelector(
      '[data-testid="workflow-json-editor-binary-upload-2"]',
    ) as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    expect(fileInput.type).toBe("file");
  });

  it("calls onUpload with the file and trimmed name when file input changes", () => {
    const onUpload = vi.fn();
    const { container } = render(
      <WorkflowJsonEditorBinaryUploadRow itemIndex={0} suggestName="file" busyKey={null} onUpload={onUpload} />,
    );
    const fileInput = container.querySelector(
      '[data-testid="workflow-json-editor-binary-upload-0"]',
    ) as HTMLInputElement;
    const file = new File(["data"], "doc.pdf", { type: "application/pdf" });
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);
    expect(onUpload).toHaveBeenCalledWith(file, "file");
  });

  it("does not call onUpload when file input change has no file", () => {
    const onUpload = vi.fn();
    const { container } = render(
      <WorkflowJsonEditorBinaryUploadRow itemIndex={0} suggestName="file" busyKey={null} onUpload={onUpload} />,
    );
    const fileInput = container.querySelector(
      '[data-testid="workflow-json-editor-binary-upload-0"]',
    ) as HTMLInputElement;
    Object.defineProperty(fileInput, "files", { value: [], configurable: true });
    fireEvent.change(fileInput);
    expect(onUpload).not.toHaveBeenCalled();
  });
});
