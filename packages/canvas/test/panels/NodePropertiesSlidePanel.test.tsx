// @vitest-environment jsdom

/**
 * Tests for NodePropertiesSlidePanel:
 * - isVisible = isOpen && Boolean(node) branches (null when closed/no node, content when both true)
 * - localStorage-persisted width on mount
 * - drag resize mousedown/mousemove/mouseup
 */

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createWorkflowCanvasApiClient, WorkflowCanvasApiClientProvider } from "@codemation/canvas-core";

import { NodePropertiesSlidePanel } from "../../src/panels/NodePropertiesSlidePanel";
import type { WorkflowDiagramNode } from "@codemation/canvas";

const neverResolveFetch: typeof globalThis.fetch = () => new Promise(() => {});

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } },
  });
}

function makeApiClient() {
  return createWorkflowCanvasApiClient({
    apiBase: "",
    getToken: () => null,
    fetch: neverResolveFetch,
  });
}

function makeNode(overrides: Partial<WorkflowDiagramNode> = {}): WorkflowDiagramNode {
  return {
    id: "node-1",
    kind: "action",
    type: "my-type",
    ...overrides,
  } as WorkflowDiagramNode;
}

function renderPanel(overrides: {
  isOpen?: boolean;
  node?: WorkflowDiagramNode | undefined;
  telemetryRunId?: string | null;
}) {
  const queryClient = makeQueryClient();
  const apiClient = makeApiClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkflowCanvasApiClientProvider value={apiClient}>
        <NodePropertiesSlidePanel
          workflowId="wf-1"
          isOpen={overrides.isOpen ?? true}
          node={overrides.node}
          telemetryRunId={overrides.telemetryRunId ?? null}
          telemetryRunStatus={undefined}
          nodeSnapshotsByNodeId={{}}
          connectionInvocations={[]}
          onClose={() => {}}
          pendingCredentialEditForNodeId={null}
          onConsumedPendingCredentialEdit={() => {}}
        />
      </WorkflowCanvasApiClientProvider>
    </QueryClientProvider>,
  );
}

describe("NodePropertiesSlidePanel — isVisible branches", () => {
  it("renders panel content when isOpen=true and node is set", () => {
    const node = makeNode();
    renderPanel({ isOpen: true, node });
    expect(screen.getByTestId("node-properties-panel")).toBeInTheDocument();
  });

  it("does NOT render panel content when isOpen=false (even with a node)", () => {
    const node = makeNode();
    renderPanel({ isOpen: false, node });
    expect(screen.queryByTestId("node-properties-panel")).toBeNull();
  });

  it("does NOT render panel content when node is undefined (even with isOpen=true)", () => {
    renderPanel({ isOpen: true, node: undefined });
    expect(screen.queryByTestId("node-properties-panel")).toBeNull();
  });

  it("the aside is always rendered (hidden via aria-hidden and translate-x-full)", () => {
    renderPanel({ isOpen: false, node: undefined });
    const aside = screen.getByTestId("node-properties-slide-panel");
    expect(aside).toBeInTheDocument();
    expect(aside.getAttribute("aria-hidden")).toBe("true");
  });

  it("aria-hidden is false (not 'true') when panel is visible", () => {
    const node = makeNode();
    renderPanel({ isOpen: true, node });
    const aside = screen.getByTestId("node-properties-slide-panel");
    // aria-hidden is set to !isVisible; when visible, it's false
    expect(aside.getAttribute("aria-hidden")).not.toBe("true");
  });
});

describe("NodePropertiesSlidePanel — drag resize", () => {
  it("resize handle is rendered when panel is open", () => {
    const node = makeNode();
    renderPanel({ isOpen: true, node });
    expect(screen.getByTestId("node-properties-panel-resize-handle")).toBeInTheDocument();
  });

  it("mousedown on resize handle initiates resize (no crash, body cursor changes)", () => {
    const node = makeNode();
    renderPanel({ isOpen: true, node });
    const handle = screen.getByTestId("node-properties-panel-resize-handle");

    fireEvent.mouseDown(handle, { clientX: 300, buttons: 1 });
    // body cursor should be set to col-resize during drag
    expect(document.body.style.cursor).toBe("col-resize");

    // MouseMove changes width
    fireEvent.mouseMove(document, { clientX: 250 });

    // MouseUp ends resize and restores cursor
    fireEvent.mouseUp(document);
    expect(document.body.style.cursor).toBe("");
  });

  it("drag left (decreasing clientX) widens the panel", () => {
    const node = makeNode();
    const { container } = renderPanel({ isOpen: true, node });
    const handle = screen.getByTestId("node-properties-panel-resize-handle");

    const aside = container.querySelector("[data-testid='node-properties-slide-panel']") as HTMLElement;
    const widthBefore = aside.style.width;

    fireEvent.mouseDown(handle, { clientX: 400, buttons: 1 });
    fireEvent.mouseMove(document, { clientX: 300 }); // delta = 100 → width increases
    fireEvent.mouseUp(document);

    // Width should have changed
    const widthAfter = aside.style.width;
    expect(widthAfter).not.toBe(widthBefore);
  });
});

describe("NodePropertiesSlidePanel — localStorage width persistence", () => {
  it("saves panel width to localStorage on mouseup", () => {
    const node = makeNode();
    renderPanel({ isOpen: true, node });
    const handle = screen.getByTestId("node-properties-panel-resize-handle");

    fireEvent.mouseDown(handle, { clientX: 400 });
    fireEvent.mouseMove(document, { clientX: 350 });
    fireEvent.mouseUp(document);

    // localStorage should have the persisted width
    const stored = localStorage.getItem("codemation-node-properties-panel-width-px");
    expect(stored).not.toBeNull();
    const px = Number.parseInt(stored!, 10);
    expect(Number.isFinite(px)).toBe(true);
  });

  it("renders subworkflow link when node has referencedWorkflowId", () => {
    const node = makeNode({ referencedWorkflowId: "sub-wf-123" });
    renderPanel({ isOpen: true, node });
    expect(screen.getByTestId("node-properties-subworkflow-section")).toBeInTheDocument();
    const link = screen.getByTestId("node-properties-subworkflow-open-link");
    expect(link.getAttribute("href")).toContain("sub-wf-123");
  });

  it("does NOT render subworkflow link when node has no referencedWorkflowId", () => {
    const node = makeNode({ referencedWorkflowId: undefined });
    renderPanel({ isOpen: true, node });
    expect(screen.queryByTestId("node-properties-subworkflow-section")).toBeNull();
  });
});
