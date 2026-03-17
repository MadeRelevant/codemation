import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkflowExecutionInspector } from "../src/ui/workflowDetail/WorkflowExecutionInspector";
import type {
  WorkflowExecutionInspectorActions,
  WorkflowExecutionInspectorFormatting,
  WorkflowExecutionInspectorModel,
} from "../src/ui/workflowDetail/workflowDetailTypes";

describe("workflow execution inspector", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps the inspector constrained to the available width", () => {
    render(
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
    render(
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
    render(
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
});

class WorkflowExecutionInspectorFixture {
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
      viewContext: "historical-run",
      selectedRunId: "run-1",
      isLoading: false,
      loadError: null,
      selectedRun: {} as WorkflowExecutionInspectorModel["selectedRun"],
      selectedNodeId: "node-1",
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
}
