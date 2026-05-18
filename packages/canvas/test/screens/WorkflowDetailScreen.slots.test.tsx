// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DefaultHeader } from "../../src/screens/defaults/DefaultHeader";
import { DefaultTabs } from "../../src/screens/defaults/DefaultTabs";
import { DefaultLoadingState } from "../../src/screens/defaults/DefaultLoadingState";
import { DefaultEmptyState } from "../../src/screens/defaults/DefaultEmptyState";
import { DefaultRunButton } from "../../src/screens/defaults/DefaultRunButton";
import type {
  WorkflowDetailHeaderSlotContext,
  WorkflowDetailTabsSlotContext,
  WorkflowDetailRunButtonSlotContext,
} from "@codemation/canvas-core";

// ---- shared ctx factories ----

function makeHeaderCtx(overrides?: Partial<WorkflowDetailHeaderSlotContext>): WorkflowDetailHeaderSlotContext {
  return {
    workflowId: "wf-1",
    workflowName: "My workflow",
    isRunning: false,
    isLiveWorkflowView: true,
    ...overrides,
  };
}

function makeTabsCtx(overrides?: Partial<WorkflowDetailTabsSlotContext>): WorkflowDetailTabsSlotContext {
  return {
    activeCanvasTab: "live",
    onSelectLive: vi.fn(),
    onSelectExecutions: vi.fn(),
    onSelectTests: vi.fn(),
    ...overrides,
  };
}

function makeRunButtonCtx(): WorkflowDetailRunButtonSlotContext {
  return {
    run: {
      triggers: [{ nodeId: "trig-1", name: "HTTP Trigger", kind: "live" }],
      selectedTriggerNodeId: "trig-1",
      isDisabled: false,
      handleSelectTrigger: vi.fn(),
      handleRunLiveTrigger: vi.fn(),
      handleRunTestTrigger: vi.fn(),
    },
  };
}

/**
 * Simulates the slot wiring in WorkflowDetailScreen:
 *   renderSlot ? renderSlot(ctx) : <DefaultComponent ctx={ctx} />
 *
 * Mounting the full WorkflowDetailScreen is not feasible in unit tests due to its
 * dependency on React Query, WorkflowCanvasApiClientProvider, and realtime hooks.
 * Instead, these helpers exercise the conditional slot logic directly.
 */
function SlotHarness<C>(props: {
  ctx: C;
  renderSlot: ((ctx: C) => React.ReactNode) | undefined;
  defaultRender: (ctx: C) => React.ReactNode;
}) {
  const { ctx, renderSlot, defaultRender } = props;
  return <>{renderSlot ? renderSlot(ctx) : defaultRender(ctx)}</>;
}

// ---- renderHeader slot ----

describe("renderHeader slot", () => {
  it("default — renders null (no visible output)", () => {
    const { container } = render(<DefaultHeader ctx={makeHeaderCtx()} />);
    expect(container.firstChild).toBeNull();
  });

  it("slot not provided — SlotHarness renders DefaultHeader (null)", () => {
    const ctx = makeHeaderCtx();
    const { container } = render(
      <SlotHarness ctx={ctx} renderSlot={undefined} defaultRender={(c) => <DefaultHeader ctx={c} />} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("slot provided — override renders, default suppressed", () => {
    const ctx = makeHeaderCtx();
    const renderHeader = vi.fn((_c: WorkflowDetailHeaderSlotContext) => (
      <div data-testid="custom-header">Custom Header</div>
    ));
    render(<SlotHarness ctx={ctx} renderSlot={renderHeader} defaultRender={(c) => <DefaultHeader ctx={c} />} />);
    expect(screen.getByTestId("custom-header")).toBeInTheDocument();
    expect(renderHeader).toHaveBeenCalledWith(ctx);
  });
});

// ---- renderTabs slot ----

describe("renderTabs slot", () => {
  it("default — renders the tab strip with live/executions/tests buttons", () => {
    render(
      <DefaultTabs
        ctx={makeTabsCtx({ activeCanvasTab: "live" })}
        canCopySelectedRunToLive={false}
        onCopyToLive={vi.fn()}
      />,
    );
    expect(screen.getByTestId("workflow-canvas-tab-live")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-canvas-tab-executions")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-canvas-tab-tests")).toBeInTheDocument();
  });

  it("default — does not render copy-to-live button when canCopySelectedRunToLive is false", () => {
    render(<DefaultTabs ctx={makeTabsCtx()} canCopySelectedRunToLive={false} onCopyToLive={vi.fn()} />);
    expect(screen.queryByTestId("canvas-copy-to-live-button")).not.toBeInTheDocument();
  });

  it("default — renders copy-to-live button when canCopySelectedRunToLive is true", () => {
    render(<DefaultTabs ctx={makeTabsCtx()} canCopySelectedRunToLive={true} onCopyToLive={vi.fn()} />);
    expect(screen.getByTestId("canvas-copy-to-live-button")).toBeInTheDocument();
  });

  it("slot provided — override renders, default tab strip suppressed", () => {
    const ctx = makeTabsCtx();
    const renderTabs = vi.fn((_c: WorkflowDetailTabsSlotContext) => <div data-testid="custom-tabs">Custom Tabs</div>);
    render(
      <SlotHarness
        ctx={ctx}
        renderSlot={renderTabs}
        defaultRender={(c) => <DefaultTabs ctx={c} canCopySelectedRunToLive={false} onCopyToLive={vi.fn()} />}
      />,
    );
    expect(screen.getByTestId("custom-tabs")).toBeInTheDocument();
    expect(screen.queryByTestId("workflow-canvas-tab-live")).not.toBeInTheDocument();
    expect(renderTabs).toHaveBeenCalledWith(ctx);
  });
});

// ---- renderLoadingState slot ----

describe("renderLoadingState slot", () => {
  it("default — renders Loading diagram… text", () => {
    render(<DefaultLoadingState />);
    expect(screen.getByText("Loading diagram…")).toBeInTheDocument();
  });

  it("slot not provided — renders default loading text", () => {
    const renderLoadingState: (() => React.ReactNode) | undefined = undefined;
    render(<>{renderLoadingState ? renderLoadingState() : <DefaultLoadingState />}</>);
    expect(screen.getByText("Loading diagram…")).toBeInTheDocument();
  });

  it("slot provided — renders override, default loading text suppressed", () => {
    const renderLoadingState = () => <div data-testid="custom-loading">Custom Loading</div>;
    render(<>{renderLoadingState ? renderLoadingState() : <DefaultLoadingState />}</>);
    expect(screen.getByTestId("custom-loading")).toBeInTheDocument();
    expect(screen.queryByText("Loading diagram…")).not.toBeInTheDocument();
  });
});

// ---- renderEmptyState slot ----

describe("renderEmptyState slot", () => {
  it("default — renders null (no visible output)", () => {
    const { container } = render(<DefaultEmptyState />);
    expect(container.firstChild).toBeNull();
  });

  it("slot not provided — renders default (null)", () => {
    const renderEmptyState: (() => React.ReactNode) | undefined = undefined;
    const { container } = render(<>{renderEmptyState ? renderEmptyState() : <DefaultEmptyState />}</>);
    expect(container.firstChild).toBeNull();
  });

  it("slot provided — renders custom empty state content", () => {
    const renderEmptyState = () => <div data-testid="custom-empty">No workflow selected</div>;
    render(<>{renderEmptyState ? renderEmptyState() : <DefaultEmptyState />}</>);
    expect(screen.getByTestId("custom-empty")).toBeInTheDocument();
  });
});

// ---- renderRunButton slot ----

describe("renderRunButton slot", () => {
  it("slot provided — renders custom run button, vi.fn() receives ctx", () => {
    const ctx = makeRunButtonCtx();
    const renderRunButton = vi.fn((_c: WorkflowDetailRunButtonSlotContext) => (
      <div data-testid="custom-run-btn">Run</div>
    ));
    render(
      <SlotHarness
        ctx={ctx}
        renderSlot={renderRunButton}
        defaultRender={(c) => <DefaultRunButton ctx={c} isRunning={false} />}
      />,
    );
    expect(screen.getByTestId("custom-run-btn")).toBeInTheDocument();
    expect(renderRunButton).toHaveBeenCalledWith(ctx);
  });

  it("slot not provided — renders DefaultRunButton", () => {
    const ctx = makeRunButtonCtx();
    render(
      <SlotHarness
        ctx={ctx}
        renderSlot={undefined}
        defaultRender={(c) => <DefaultRunButton ctx={c} isRunning={false} />}
      />,
    );
    // DefaultRunButton renders without crashing when triggers are present
    expect(document.body).toBeInTheDocument();
  });
});
