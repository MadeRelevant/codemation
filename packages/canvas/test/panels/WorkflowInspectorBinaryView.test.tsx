// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowInspectorBinaryView } from "../../src/panels/WorkflowInspectorBinaryView";
import type { WorkflowExecutionInspectorAttachmentModel } from "@codemation/canvas";

function makeAttachment(): WorkflowExecutionInspectorAttachmentModel {
  return {
    key: "att-1",
    itemIndex: 0,
    name: "my-file.pdf",
    contentUrl: "/api/runs/r1/binary/att-1",
    attachment: {
      id: "att-1",
      filename: "my-file.pdf",
      mimeType: "application/pdf",
      size: 1024,
      previewKind: "download",
    },
  } as unknown as WorkflowExecutionInspectorAttachmentModel;
}

describe("WorkflowInspectorBinaryView", () => {
  it("renders empty state when attachments array is empty", () => {
    render(<WorkflowInspectorBinaryView attachments={[]} emptyLabel="No attachments" />);
    expect(screen.getByTestId("workflow-inspector-empty-state").textContent).toBe("No attachments");
  });

  it("renders the attachment list when attachments are present", () => {
    render(<WorkflowInspectorBinaryView attachments={[makeAttachment()]} emptyLabel="No attachments" />);
    expect(screen.queryByTestId("workflow-inspector-empty-state")).toBeNull();
  });
});
