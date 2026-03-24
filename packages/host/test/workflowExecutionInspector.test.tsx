import type { BinaryAttachment } from "@codemation/core";
import { WorkflowExecutionInspector } from "@codemation/next-host/src/features/workflows/components/workflowDetail/WorkflowExecutionInspector";
import type {
WorkflowExecutionInspectorActions,
WorkflowExecutionInspectorFormatting,
WorkflowExecutionInspectorModel,
} from "@codemation/next-host/src/features/workflows/lib/workflowDetail/workflowDetailTypes";
import { QueryClient,QueryClientProvider } from "@tanstack/react-query";
import { cleanup,fireEvent,render,screen,within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach,describe,expect,it,vi } from "vitest";

describe("workflow execution inspector", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps the inspector constrained to the available width", () => {
    WorkflowExecutionInspectorFixture.render(
      <div style={{ width: 480, height: 320 }}>
        <WorkflowExecutionInspector
          model={WorkflowExecutionInspectorFixture.createModel()}
          formatting={WorkflowExecutionInspectorFixture.createFormatting()}
          actions={WorkflowExecutionInspectorFixture.createActions()}
        />
      </div>,
    );

    expect(screen.getByTestId("workflow-execution-inspector")).toHaveStyle({
      gridTemplateColumns: "320px 8px minmax(0, 1fr)",
      minWidth: "0px",
      overflow: "hidden",
    });

    expect(screen.getByTestId("workflow-execution-tree-panel")).toHaveStyle({
      minWidth: "0px",
      overflowX: "hidden",
      overflowY: "auto",
    });

    for (const panel of screen.getAllByTestId("workflow-inspector-json-panel")) {
      expect(panel).toHaveStyle({
        minWidth: "0px",
        overflowX: "hidden",
        overflowY: "auto",
      });
    }
  });

  it("resizes the execution tree panel when the splitter is dragged", () => {
    WorkflowExecutionInspectorFixture.render(
      <div style={{ width: 900, height: 320 }}>
        <WorkflowExecutionInspector
          model={WorkflowExecutionInspectorFixture.createModel()}
          formatting={WorkflowExecutionInspectorFixture.createFormatting()}
          actions={WorkflowExecutionInspectorFixture.createActions()}
        />
      </div>,
    );

    const inspector = screen.getByTestId("workflow-execution-inspector");
    const resizer = screen.getByTestId("workflow-execution-tree-resizer");

    Object.defineProperty(inspector, "clientWidth", {
      configurable: true,
      value: 900,
    });

    fireEvent.mouseDown(resizer, { clientX: 320 });
    fireEvent.mouseMove(window, { clientX: 420 });
    fireEvent.mouseUp(window);

    expect(inspector).toHaveStyle({
      gridTemplateColumns: "420px 8px minmax(0, 1fr)",
    });
  });

  it("shows only the duration in the tree and keeps full timing details in the header", () => {
    WorkflowExecutionInspectorFixture.render(
      <div style={{ width: 900, height: 320 }}>
        <WorkflowExecutionInspector
          model={WorkflowExecutionInspectorFixture.createModel()}
          formatting={WorkflowExecutionInspectorFixture.createFormatting()}
          actions={WorkflowExecutionInspectorFixture.createActions()}
        />
      </div>,
    );

    expect(screen.getByTestId("execution-tree-node-duration-node-1")).toHaveTextContent("Took 500ms");
    expect(within(screen.getByTestId("execution-tree-node-node-1")).queryByText("Today 09:51:00")).not.toBeInTheDocument();
    expect(screen.getByText("Today 09:51:00")).toBeInTheDocument();
    expect(screen.getByTestId("selected-node-duration")).toHaveTextContent("Took 500ms");
  });

  it("shows a binary tab only when attachments exist and renders attachments in that tab", () => {
    const model = WorkflowExecutionInspectorFixture.createModelWithOutputAttachments();
    const actions = WorkflowExecutionInspectorFixture.createActions();

    WorkflowExecutionInspectorFixture.render(
      <div style={{ width: 900, height: 320 }}>
        <WorkflowExecutionInspector
          model={model}
          formatting={WorkflowExecutionInspectorFixture.createFormatting()}
          actions={actions}
        />
      </div>,
    );

    expect(screen.queryByTestId("workflow-inspector-attachments")).not.toBeInTheDocument();
    expect(screen.getByTestId("inspector-format-output-binary")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("inspector-format-output-binary"));

    expect(actions.onSelectFormat).toHaveBeenCalledWith("output", "binary");
  });

  it("renders binary attachments in a dedicated pane", () => {
    const model = WorkflowExecutionInspectorFixture.createModelWithOutputAttachments();
    WorkflowExecutionInspectorFixture.render(
      <div style={{ width: 900, height: 320 }}>
        <WorkflowExecutionInspector
          model={{
            ...model,
            outputPane: {
              ...model.outputPane,
              format: "binary",
            },
          }}
          formatting={WorkflowExecutionInspectorFixture.createFormatting()}
          actions={WorkflowExecutionInspectorFixture.createActions()}
        />
      </div>,
    );

    expect(screen.getByTestId("workflow-inspector-attachments")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-inspector-attachment-group-label-item-1")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-inspector-attachment-group-label-item-2")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-inspector-attachment-group-label-item-3")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-inspector-image-preview-bin-image")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-inspector-audio-preview-bin-audio")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-inspector-video-preview-bin-video")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-inspector-attachment-link-bin-image")).toHaveAttribute(
      "href",
      "/api/runs/run-1/binary/bin-image/content",
    );
  });

  it("hides item grouping when all binaries belong to one item", () => {
    const model = WorkflowExecutionInspectorFixture.createModelWithOutputAttachments();
    WorkflowExecutionInspectorFixture.render(
      <div style={{ width: 900, height: 320 }}>
        <WorkflowExecutionInspector
          model={{
            ...model,
            outputPane: {
              ...model.outputPane,
              format: "binary",
              attachments: model.outputPane.attachments.map((attachment) => ({
                ...attachment,
                itemIndex: 0,
              })),
            },
          }}
          formatting={WorkflowExecutionInspectorFixture.createFormatting()}
          actions={WorkflowExecutionInspectorFixture.createActions()}
        />
      </div>,
    );

    expect(screen.queryByTestId("workflow-inspector-attachment-group-label-item-1")).not.toBeInTheDocument();
    expect(screen.queryByTestId("workflow-inspector-attachment-group-label-item-2")).not.toBeInTheDocument();
    expect(screen.getByTestId("workflow-inspector-attachment-bin-image")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-inspector-attachment-bin-audio")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-inspector-attachment-bin-video")).toBeInTheDocument();
  });

  it("hides the binary format button when a pane has no attachments", () => {
    WorkflowExecutionInspectorFixture.render(
      <div style={{ width: 900, height: 320 }}>
        <WorkflowExecutionInspector
          model={WorkflowExecutionInspectorFixture.createModel()}
          formatting={WorkflowExecutionInspectorFixture.createFormatting()}
          actions={WorkflowExecutionInspectorFixture.createActions()}
        />
      </div>,
    );

    expect(screen.queryByTestId("inspector-format-input-binary")).not.toBeInTheDocument();
    expect(screen.queryByTestId("inspector-format-output-binary")).not.toBeInTheDocument();
  });
});

class WorkflowExecutionInspectorFixture {
  static render(node: ReactNode) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    });
    return render(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
  }

  static createModel(): WorkflowExecutionInspectorModel {
    const selectedNodeSnapshot = {
      runId: "run-1",
      workflowId: "wf-1",
      nodeId: "node-1",
      status: "completed",
      startedAt: "2026-03-15T09:50:59.500Z",
      finishedAt: "2026-03-15T09:51:00.000Z",
      updatedAt: "2026-03-15T09:51:00.000Z",
    } as WorkflowExecutionInspectorModel["selectedNodeSnapshot"];

    return {
      workflowId: "wf-1",
      viewContext: "historical-run",
      selectedRunId: "run-1",
      isLoading: false,
      loadError: null,
      selectedRun: {} as WorkflowExecutionInspectorModel["selectedRun"],
      selectedNodeId: "node-1",
      selectedExecutionTreeKey: "node-1",
      selectedNodeSnapshot,
      selectedWorkflowNode: undefined,
      selectedPinnedOutput: undefined,
      selectedNodeError: undefined,
      selectedMode: "split",
      inputPane: {
        tab: "input",
        format: "json",
        selectedPort: "main",
        portEntries: [["main", []]],
        attachments: [],
        value: {
          body:
            "This payload stays readable even when the inspector is narrow because the pane should wrap and clip instead of widening the layout.".repeat(4),
        },
        emptyLabel: "No input",
        showsError: false,
      },
      outputPane: {
        tab: "output",
        format: "json",
        selectedPort: "main",
        portEntries: [["main", []]],
        attachments: [],
        value: {
          result:
            "This output is intentionally long to mimic large execution payloads without letting the inspector grow wider than the viewport.".repeat(4),
        },
        emptyLabel: "No output",
        showsError: false,
      },
      executionTreeData: [
        {
          key: "node-1",
          snapshot: selectedNodeSnapshot,
        },
      ],
      executionTreeExpandedKeys: ["node-1"],
      nodeActions: {
        viewContext: "historical-run",
        isRunning: false,
        canEditOutput: false,
        canClearPinnedOutput: false,
      },
    };
  }

  static createModelWithOutputAttachments(): WorkflowExecutionInspectorModel {
    const model = this.createModel();
    return {
      ...model,
      outputPane: {
        ...model.outputPane,
        attachments: [
          {
            key: "attachment-image",
            itemIndex: 0,
            name: "body",
            contentUrl: "/api/runs/run-1/binary/bin-image/content",
            attachment: WorkflowExecutionInspectorFixture.createAttachment({
              id: "bin-image",
              previewKind: "image",
              mimeType: "image/png",
            }),
          },
          {
            key: "attachment-audio",
            itemIndex: 1,
            name: "audio",
            contentUrl: "/api/runs/run-1/binary/bin-audio/content",
            attachment: WorkflowExecutionInspectorFixture.createAttachment({
              id: "bin-audio",
              previewKind: "audio",
              mimeType: "audio/mpeg",
            }),
          },
          {
            key: "attachment-video",
            itemIndex: 2,
            name: "video",
            contentUrl: "/api/runs/run-1/binary/bin-video/content",
            attachment: WorkflowExecutionInspectorFixture.createAttachment({
              id: "bin-video",
              previewKind: "video",
              mimeType: "video/mp4",
            }),
          },
        ],
      },
    };
  }

  static createFormatting(): WorkflowExecutionInspectorFormatting {
    return {
      formatDateTime: () => "Today 09:51:00",
      formatDurationLabel: (snapshot) => (snapshot?.startedAt && snapshot.finishedAt ? "Took 500ms" : null),
      getNodeDisplayName: (_node, fallback) => fallback ?? "Unnamed node",
      getSnapshotTimestamp: (snapshot) => snapshot?.finishedAt,
      getErrorHeadline: () => "No error",
      getErrorStack: () => null,
      getErrorClipboardText: () => "",
    };
  }

  static createActions(): WorkflowExecutionInspectorActions {
    return {
      onSelectNode: vi.fn(),
      onEditSelectedOutput: vi.fn(),
      onClearPinnedOutput: vi.fn(),
      onSelectMode: vi.fn(),
      onSelectFormat: vi.fn(),
      onSelectInputPort: vi.fn(),
      onSelectOutputPort: vi.fn(),
    };
  }

  static createAttachment(overrides: Readonly<Partial<BinaryAttachment>> = {}): BinaryAttachment {
    return {
      id: overrides.id ?? "bin-1",
      storageKey: overrides.storageKey ?? "wf-1/run-1/node-1/act-1/bin-1",
      mimeType: overrides.mimeType ?? "application/octet-stream",
      size: overrides.size ?? 128,
      storageDriver: overrides.storageDriver ?? "filesystem",
      previewKind: overrides.previewKind ?? "download",
      createdAt: overrides.createdAt ?? "2026-03-15T09:51:00.000Z",
      runId: overrides.runId ?? "run-1",
      workflowId: overrides.workflowId ?? "wf-1",
      nodeId: overrides.nodeId ?? "node-1",
      activationId: overrides.activationId ?? "act-1",
      filename: overrides.filename ?? "file.bin",
      sha256: overrides.sha256 ?? "abc123",
    };
  }
}
