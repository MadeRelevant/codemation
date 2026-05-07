// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WorkflowExecutionInspectorDetailBody } from "../../src/features/workflows/components/workflowDetail/WorkflowExecutionInspectorDetailBody";
import type { WorkflowNode } from "../../src/features/workflows/lib/workflowDetail/workflowDetailTypes";
import type { NodeExecutionSnapshot } from "../../src/features/workflows/hooks/realtime/realtime";

describe("WorkflowExecutionInspectorDetailBody — subworkflow deep-link", () => {
  afterEach(() => {
    cleanup();
  });

  function makeFormatting() {
    return {
      formatDateTime: (v: string | undefined) => v ?? "",
      formatDurationLabel: () => null,
      getErrorClipboardText: () => "",
      getErrorHeadline: () => "",
      getErrorStack: () => null,
      getNodeDisplayName: (node: WorkflowNode | undefined, fallback: string | null) => node?.name ?? fallback ?? "",
      getSnapshotTimestamp: () => undefined,
    };
  }

  function makeActions() {
    return {
      onClearPinnedOutput: vi.fn(),
      onEditSelectedOutput: vi.fn(),
      onSelectFormat: vi.fn(),
      onSelectInputPort: vi.fn(),
      onSelectMode: vi.fn(),
      onSelectOutputPort: vi.fn(),
    };
  }

  function makePane() {
    return {
      tab: "output" as const,
      format: "json" as const,
      selectedPort: null,
      portEntries: [],
      value: undefined,
      attachments: [],
      emptyLabel: "No output",
      showsError: false,
    };
  }

  function makeSnapshot(overrides: Partial<NodeExecutionSnapshot> = {}): NodeExecutionSnapshot {
    return {
      runId: "run_parent",
      workflowId: "wf.parent",
      nodeId: "node_sub",
      status: "completed",
      updatedAt: "2026-01-01T00:00:00.000Z",
      ...overrides,
    };
  }

  function makeSubWorkflowNode(overrides: Partial<WorkflowNode> = {}): WorkflowNode {
    return {
      id: "node_sub",
      kind: "node",
      type: "SubWorkflow",
      name: "My Subworkflow",
      referencedWorkflowId: "wf.child",
      ...overrides,
    } as WorkflowNode;
  }

  it("renders 'Open subworkflow run' with ?run= when childRunId is present on snapshot", () => {
    const snapshot = makeSnapshot({ childRunId: "run_child_123" });
    const workflowNode = makeSubWorkflowNode();

    render(
      <WorkflowExecutionInspectorDetailBody
        model={{
          inputPane: makePane(),
          outputPane: makePane(),
          selectedMode: "output",
          selectedNodeError: undefined,
          selectedNodeId: "node_sub",
          nodeActions: {
            viewContext: "historical-run",
            isRunning: false,
            canEditOutput: false,
            canClearPinnedOutput: false,
          },
          selectedNodeSnapshot: snapshot,
          selectedPinnedOutput: undefined,
          selectedWorkflowNode: workflowNode,
          viewContext: "historical-run",
        }}
        formatting={makeFormatting()}
        actions={makeActions()}
      />,
    );

    const link = screen.getByTestId("execution-inspector-subworkflow-link");
    expect(link).toHaveTextContent("Open subworkflow run");
    expect(link).toHaveAttribute("href", "/workflows/wf.child?run=run_child_123");
  });

  it("renders 'Open subworkflow editor' without ?run= when childRunId is absent", () => {
    const snapshot = makeSnapshot(); // no childRunId
    const workflowNode = makeSubWorkflowNode();

    render(
      <WorkflowExecutionInspectorDetailBody
        model={{
          inputPane: makePane(),
          outputPane: makePane(),
          selectedMode: "output",
          selectedNodeError: undefined,
          selectedNodeId: "node_sub",
          nodeActions: {
            viewContext: "historical-run",
            isRunning: false,
            canEditOutput: false,
            canClearPinnedOutput: false,
          },
          selectedNodeSnapshot: snapshot,
          selectedPinnedOutput: undefined,
          selectedWorkflowNode: workflowNode,
          viewContext: "historical-run",
        }}
        formatting={makeFormatting()}
        actions={makeActions()}
      />,
    );

    const link = screen.getByTestId("execution-inspector-subworkflow-link");
    expect(link).toHaveTextContent("Open subworkflow editor");
    expect(link).toHaveAttribute("href", "/workflows/wf.child");
  });

  it("renders 'Open subworkflow editor' when selectedNodeSnapshot is undefined (legacy run)", () => {
    const workflowNode = makeSubWorkflowNode();

    render(
      <WorkflowExecutionInspectorDetailBody
        model={{
          inputPane: makePane(),
          outputPane: makePane(),
          selectedMode: "output",
          selectedNodeError: undefined,
          selectedNodeId: "node_sub",
          nodeActions: {
            viewContext: "historical-run",
            isRunning: false,
            canEditOutput: false,
            canClearPinnedOutput: false,
          },
          selectedNodeSnapshot: undefined,
          selectedPinnedOutput: undefined,
          selectedWorkflowNode: workflowNode,
          viewContext: "historical-run",
        }}
        formatting={makeFormatting()}
        actions={makeActions()}
      />,
    );

    const link = screen.getByTestId("execution-inspector-subworkflow-link");
    expect(link).toHaveTextContent("Open subworkflow editor");
    expect(link).toHaveAttribute("href", "/workflows/wf.child");
  });

  it("does not render the link when node has no referencedWorkflowId", () => {
    const snapshot = makeSnapshot({ childRunId: "run_child_123" });
    const workflowNode = makeSubWorkflowNode({ referencedWorkflowId: undefined });

    render(
      <WorkflowExecutionInspectorDetailBody
        model={{
          inputPane: makePane(),
          outputPane: makePane(),
          selectedMode: "output",
          selectedNodeError: undefined,
          selectedNodeId: "node_sub",
          nodeActions: {
            viewContext: "historical-run",
            isRunning: false,
            canEditOutput: false,
            canClearPinnedOutput: false,
          },
          selectedNodeSnapshot: snapshot,
          selectedPinnedOutput: undefined,
          selectedWorkflowNode: workflowNode,
          viewContext: "historical-run",
        }}
        formatting={makeFormatting()}
        actions={makeActions()}
      />,
    );

    expect(screen.queryByTestId("execution-inspector-subworkflow-link")).toBeNull();
  });
});
