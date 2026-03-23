// @vitest-environment jsdom

import type { BinaryAttachment } from "@codemation/core/browser";
import { WorkflowJsonEditorDialog } from "../src/features/workflows/components/workflowDetail/WorkflowJsonEditorDialog";
import { WorkflowDetailPresenter } from "../src/features/workflows/lib/workflowDetail/WorkflowDetailPresenter";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@monaco-editor/react", () => ({
  default: function MockMonacoEditor(props: Readonly<{ value?: string }>) {
    return <textarea data-testid="mock-monaco-editor" value={props.value ?? ""} readOnly />;
  },
}));

function createAttachment(overrides: Partial<BinaryAttachment> = {}): BinaryAttachment {
  return {
    id: "att-1",
    storageKey: "k",
    mimeType: "text/plain",
    size: 3,
    storageDriver: "memory",
    previewKind: "download",
    createdAt: "2026-01-01T00:00:00.000Z",
    runId: "overlay-pin",
    workflowId: "wf-1",
    nodeId: "node-1",
    activationId: "overlay-pin-i0",
    ...overrides,
  };
}

describe("WorkflowJsonEditorDialog pin-output binaries", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders JSON and Binaries tabs for pin-output mode", () => {
    render(
      <WorkflowJsonEditorDialog
        initialEditorTab="binaries"
        state={{
          mode: "pin-output",
          title: "Pin",
          value: JSON.stringify([{ a: 1 }, { b: 2 }]),
          workflowId: "wf-1",
          nodeId: "node-1",
          binaryMapsByItemIndex: [{}, {}],
        }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByTestId("workflow-json-editor-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-json-editor-binaries-tab")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-json-editor-binaries-item-0")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-json-editor-binaries-item-1")).toBeInTheDocument();
  });

  it("invokes onSave with JSON text and binary maps", () => {
    const onSave = vi.fn();
    const doc = createAttachment({ id: "doc-id" });

    render(
      <WorkflowJsonEditorDialog
        state={{
          mode: "pin-output",
          title: "Pin",
          value: JSON.stringify([{ x: 1 }]),
          workflowId: "wf-1",
          nodeId: "node-1",
          binaryMapsByItemIndex: [{ doc }],
        }}
        onClose={vi.fn()}
        onSave={onSave}
      />,
    );

    fireEvent.click(screen.getByTestId("workflow-json-editor-save"));

    expect(onSave).toHaveBeenCalledTimes(1);
    const [jsonText, maps] = onSave.mock.calls[0]!;
    expect(typeof jsonText).toBe("string");
    expect(maps).toHaveLength(1);
    expect(maps[0]?.doc?.id).toBe("doc-id");
  });

  it("reindexes presenter binary maps when item count shrinks", () => {
    const doc = createAttachment({ id: "keep" });
    const initialMaps = WorkflowDetailPresenter.extractBinaryMapsFromItems([
      { json: { a: 1 }, binary: { doc } },
      { json: { b: 2 } },
    ]);
    const reindexed = WorkflowDetailPresenter.reindexBinaryMapsForItemCount(initialMaps, 1);
    expect(reindexed).toHaveLength(1);
    expect(reindexed[0]?.doc?.id).toBe("keep");
  });

  it("uploads a file and lists the attachment row", async () => {
    const uploaded = createAttachment({ id: "new-id", filename: "f.txt" });
    vi.spyOn(WorkflowDetailPresenter, "uploadOverlayPinnedBinary").mockResolvedValue(uploaded);

    render(
      <WorkflowJsonEditorDialog
        initialEditorTab="binaries"
        state={{
          mode: "pin-output",
          title: "Pin",
          value: JSON.stringify([{ a: 1 }]),
          workflowId: "wf-1",
          nodeId: "node-1",
          binaryMapsByItemIndex: [{}],
        }}
        onClose={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(screen.getByTestId("workflow-json-editor-binary-name-0")).toBeInTheDocument();

    const fileInput = screen.getByTestId("workflow-json-editor-binary-upload-0") as HTMLInputElement;
    const file = new File([new Uint8Array([1, 2, 3])], "x.bin", { type: "application/octet-stream" });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByTestId("workflow-json-editor-binary-row-0-file")).toBeInTheDocument();
    });
  });
});
