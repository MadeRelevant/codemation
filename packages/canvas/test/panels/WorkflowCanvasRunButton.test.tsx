// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { WorkflowCanvasRunButton } from "../../src/panels/WorkflowCanvasRunButton";

type Trigger = { nodeId: string; name: string; kind: "live" | "test" };

function makeLive(nodeId: string, name: string): Trigger {
  return { nodeId, name, kind: "live" };
}

function makeTest(nodeId: string, name: string): Trigger {
  return { nodeId, name, kind: "test" };
}

function renderButton(
  triggers: Trigger[],
  selected: string | null = null,
  handlers: Partial<{
    onSelect: (id: string) => void;
    onRunLive: (id: string) => void;
    onRunTest: (id: string) => void;
  }> = {},
) {
  const onSelect = handlers.onSelect ?? vi.fn();
  const onRunLive = handlers.onRunLive ?? vi.fn();
  const onRunTest = handlers.onRunTest ?? vi.fn();
  render(
    <WorkflowCanvasRunButton
      triggers={triggers}
      selectedTriggerNodeId={selected}
      onSelect={onSelect}
      onRunLive={onRunLive}
      onRunTest={onRunTest}
    />,
  );
  return { onSelect, onRunLive, onRunTest };
}

describe("WorkflowCanvasRunButton — run button text", () => {
  it("shows 'Run workflow' when not running", () => {
    renderButton([makeLive("t1", "HTTP")]);
    expect(screen.getByTestId("canvas-run-workflow-button")).toHaveTextContent("Run workflow");
  });

  it("shows 'Running...' when isRunning is true", () => {
    render(
      <WorkflowCanvasRunButton
        triggers={[makeLive("t1", "HTTP")]}
        selectedTriggerNodeId={null}
        isRunning
        onSelect={vi.fn()}
        onRunLive={vi.fn()}
        onRunTest={vi.fn()}
      />,
    );
    expect(screen.getByTestId("canvas-run-workflow-button")).toHaveTextContent("Running...");
  });

  it("run button is disabled when disabled=true", () => {
    render(
      <WorkflowCanvasRunButton
        triggers={[makeLive("t1", "HTTP")]}
        selectedTriggerNodeId={null}
        disabled
        onSelect={vi.fn()}
        onRunLive={vi.fn()}
        onRunTest={vi.fn()}
      />,
    );
    expect(screen.getByTestId("canvas-run-workflow-button")).toBeDisabled();
  });
});

describe("WorkflowCanvasRunButton — defaultTrigger selection", () => {
  it("prefers live triggers over test triggers for default", () => {
    const onRunLive = vi.fn();
    const onRunTest = vi.fn();
    render(
      <WorkflowCanvasRunButton
        triggers={[makeTest("t-test", "Test"), makeLive("t-live", "HTTP")]}
        selectedTriggerNodeId={null}
        onSelect={vi.fn()}
        onRunLive={onRunLive}
        onRunTest={onRunTest}
      />,
    );
    fireEvent.click(screen.getByTestId("canvas-run-workflow-button"));
    expect(onRunLive).toHaveBeenCalledWith("t-live");
    expect(onRunTest).not.toHaveBeenCalled();
  });

  it("falls back to test trigger when no live triggers exist", () => {
    const onRunTest = vi.fn();
    render(
      <WorkflowCanvasRunButton
        triggers={[makeTest("t-test", "Test")]}
        selectedTriggerNodeId={null}
        onSelect={vi.fn()}
        onRunLive={vi.fn()}
        onRunTest={onRunTest}
      />,
    );
    fireEvent.click(screen.getByTestId("canvas-run-workflow-button"));
    expect(onRunTest).toHaveBeenCalledWith("t-test");
  });

  it("uses selected trigger over default trigger when selectedTriggerNodeId matches", () => {
    const onRunTest = vi.fn();
    const onRunLive = vi.fn();
    render(
      <WorkflowCanvasRunButton
        triggers={[makeLive("t-live", "HTTP"), makeTest("t-test", "Manual test")]}
        selectedTriggerNodeId="t-test"
        onSelect={vi.fn()}
        onRunLive={onRunLive}
        onRunTest={onRunTest}
      />,
    );
    fireEvent.click(screen.getByTestId("canvas-run-workflow-button"));
    expect(onRunTest).toHaveBeenCalledWith("t-test");
    expect(onRunLive).not.toHaveBeenCalled();
  });

  it("falls back to defaultTrigger when selectedTriggerNodeId does not match any trigger", () => {
    const onRunLive = vi.fn();
    render(
      <WorkflowCanvasRunButton
        triggers={[makeLive("t-live", "HTTP")]}
        selectedTriggerNodeId="nonexistent"
        onSelect={vi.fn()}
        onRunLive={onRunLive}
        onRunTest={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("canvas-run-workflow-button"));
    expect(onRunLive).toHaveBeenCalledWith("t-live");
  });

  it("does nothing when run clicked with no triggers", () => {
    const onRunLive = vi.fn();
    const onRunTest = vi.fn();
    render(
      <WorkflowCanvasRunButton
        triggers={[]}
        selectedTriggerNodeId={null}
        onSelect={vi.fn()}
        onRunLive={onRunLive}
        onRunTest={onRunTest}
      />,
    );
    fireEvent.click(screen.getByTestId("canvas-run-workflow-button"));
    expect(onRunLive).not.toHaveBeenCalled();
    expect(onRunTest).not.toHaveBeenCalled();
  });
});

describe("WorkflowCanvasRunButton — trigger picker button", () => {
  it("renders the trigger picker chevron button", () => {
    renderButton([makeLive("t1", "HTTP")]);
    expect(screen.getByTestId("canvas-run-workflow-trigger-picker")).toBeInTheDocument();
  });
});

// Open Radix dropdown: pointerDown then click.
function openTriggerDropdown(triggerBtn: HTMLElement): void {
  fireEvent.pointerDown(triggerBtn);
  fireEvent.click(triggerBtn);
}

describe("WorkflowCanvasRunButton — handleSelectTrigger (dropdown selection)", () => {
  it("selecting a live trigger from dropdown calls onSelect and onRunLive", () => {
    const onSelect = vi.fn();
    const onRunLive = vi.fn();
    const onRunTest = vi.fn();
    render(
      <WorkflowCanvasRunButton
        triggers={[makeLive("t-live", "My Live")]}
        selectedTriggerNodeId={null}
        onSelect={onSelect}
        onRunLive={onRunLive}
        onRunTest={onRunTest}
      />,
    );
    openTriggerDropdown(screen.getByTestId("canvas-run-workflow-trigger-picker"));
    const item = screen.getByText("My Live").closest('[role="menuitem"]')!;
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledWith("t-live");
    expect(onRunLive).toHaveBeenCalledWith("t-live");
    expect(onRunTest).not.toHaveBeenCalled();
  });

  it("selecting a test trigger from dropdown calls onSelect and onRunTest", () => {
    const onSelect = vi.fn();
    const onRunLive = vi.fn();
    const onRunTest = vi.fn();
    render(
      <WorkflowCanvasRunButton
        triggers={[makeTest("t-test", "My Test")]}
        selectedTriggerNodeId={null}
        onSelect={onSelect}
        onRunLive={onRunLive}
        onRunTest={onRunTest}
      />,
    );
    openTriggerDropdown(screen.getByTestId("canvas-run-workflow-trigger-picker"));
    const item = screen.getByText("My Test").closest('[role="menuitem"]')!;
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledWith("t-test");
    expect(onRunTest).toHaveBeenCalledWith("t-test");
    expect(onRunLive).not.toHaveBeenCalled();
  });

  it("separator is rendered when there are both live and test triggers", () => {
    render(
      <WorkflowCanvasRunButton
        triggers={[makeLive("t-live", "HTTP"), makeTest("t-test", "Test")]}
        selectedTriggerNodeId={null}
        onSelect={vi.fn()}
        onRunLive={vi.fn()}
        onRunTest={vi.fn()}
      />,
    );
    openTriggerDropdown(screen.getByTestId("canvas-run-workflow-trigger-picker"));
    // Both "Live Triggers" and "Test Triggers" labels appear when mixed kinds present
    expect(document.body.textContent).toContain("Live Triggers");
    expect(document.body.textContent).toContain("Test Triggers");
  });
});
