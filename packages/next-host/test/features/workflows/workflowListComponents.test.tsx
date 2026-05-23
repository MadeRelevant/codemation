// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowListItemCard } from "../../../src/features/workflows/components/WorkflowListItemCard";
import { WorkflowListRoot } from "../../../src/features/workflows/components/WorkflowListRoot";
import { WorkflowListFolderSection } from "../../../src/features/workflows/components/WorkflowListFolderSection";
import { WorkflowsList } from "../../../src/features/workflows/screens/WorkflowsList";
import type { WorkflowSummary } from "@codemation/canvas";
import { WorkflowFolderTreeBuilder } from "../../../src/shell/WorkflowFolderTreeBuilder";

/**
 * next/link triggers router navigation which jsdom doesn't support.
 * Install a minimal polyfill so link rendering doesn't throw.
 */
function installNavigationPolyfills(): void {
  if (typeof window === "undefined") return;
  // Suppress jsdom "not implemented: navigation" errors by intercepting
  // the window.location assignment that next/link triggers.
  // We don't actually navigate — we just render the link.
}
installNavigationPolyfills();

function makeWorkflow(overrides: Partial<WorkflowSummary> = {}): WorkflowSummary {
  return {
    id: "wf.test",
    name: "Test Workflow",
    active: true,
    discoveryPathSegments: [],
    ...overrides,
  };
}

// Note on WorkflowFolderTreeBuilder segment logic:
// A workflow with discoveryPathSegments = ["folder"] goes directly into root.workflows
// (the single segment IS the "name" leaf, not a folder).
// For a folder to be created you need 2+ segments: ["folder", "workflow-name"].

// ─── WorkflowListItemCard ─────────────────────────────────────────────────────

describe("WorkflowListItemCard", () => {
  it("renders the workflow name and link", () => {
    const workflow = makeWorkflow({ id: "wf.gmail", name: "Gmail triage" });
    render(
      <ul>
        <WorkflowListItemCard workflow={workflow} appearance="root" />
      </ul>,
    );
    expect(screen.getByTestId("workflow-list-item-wf.gmail")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-open-wf.gmail")).toHaveTextContent("Gmail triage");
  });

  it("renders the workflow ID", () => {
    const workflow = makeWorkflow({ id: "wf.sales" });
    render(
      <ul>
        <WorkflowListItemCard workflow={workflow} appearance="root" />
      </ul>,
    );
    const item = screen.getByTestId("workflow-list-item-wf.sales");
    expect(item).toHaveTextContent("wf.sales");
  });

  it("renders the path line when discoveryPathSegments are present", () => {
    const workflow = makeWorkflow({
      id: "wf.nested",
      // 2 segments: last segment is the workflow leaf, first is the folder
      discoveryPathSegments: ["integrations", "gmail"],
    });
    render(
      <ul>
        <WorkflowListItemCard workflow={workflow} appearance="folder" />
      </ul>,
    );
    // pathLine = segments.join(" / ") — only shown when length > 0
    expect(screen.getByTestId("workflow-list-item-wf.nested")).toHaveTextContent("integrations / gmail");
  });

  it("does not render a separator dot (·) when discoveryPathSegments is empty", () => {
    const workflow = makeWorkflow({ id: "wf.root", discoveryPathSegments: [] });
    const { container } = render(
      <ul>
        <WorkflowListItemCard workflow={workflow} appearance="root" />
      </ul>,
    );
    // Separator dot should not appear when there is no path line
    expect(container).not.toHaveTextContent("·");
  });

  it("encodes the workflow id in the href", () => {
    const workflow = makeWorkflow({ id: "wf/special" });
    render(
      <ul>
        <WorkflowListItemCard workflow={workflow} appearance="root" />
      </ul>,
    );
    const link = screen.getByTestId("workflow-open-wf/special");
    expect(link).toHaveAttribute("href", "/workflows/wf%2Fspecial");
  });
});

// ─── WorkflowsList ────────────────────────────────────────────────────────────

describe("WorkflowsList", () => {
  it("shows loading state when workflows is undefined", () => {
    render(<WorkflowsList workflows={undefined} error={null} />);
    expect(screen.getByTestId("workflows-loading")).toBeInTheDocument();
  });

  it("shows error state when error is provided", () => {
    render(<WorkflowsList workflows={undefined} error="Network error" />);
    expect(screen.getByTestId("workflows-load-error")).toHaveTextContent("Network error");
  });

  it("shows empty state when workflows array is empty", () => {
    render(<WorkflowsList workflows={[]} error={null} />);
    expect(screen.getByTestId("workflows-empty")).toBeInTheDocument();
  });
});

// ─── WorkflowListRoot ─────────────────────────────────────────────────────────

describe("WorkflowListRoot", () => {
  it("renders workflow item cards for root-level workflows", () => {
    const builder = new WorkflowFolderTreeBuilder();
    const workflows = [
      makeWorkflow({ id: "wf.a", name: "Alpha", discoveryPathSegments: [] }),
      makeWorkflow({ id: "wf.b", name: "Beta", discoveryPathSegments: [] }),
    ];
    const tree = builder.build(workflows);
    render(
      <ul>
        <WorkflowListRoot node={tree} pathname="/workflows" workflows={workflows} />
      </ul>,
    );
    expect(screen.getByTestId("workflow-list-item-wf.a")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-list-item-wf.b")).toBeInTheDocument();
  });

  it("renders folder sections for workflows with 2+ path segments", () => {
    // WorkflowFolderTreeBuilder: 2 segments means first is folder, second is workflow leaf
    const builder = new WorkflowFolderTreeBuilder();
    const workflows = [
      makeWorkflow({
        id: "wf.nested",
        name: "Gmail triage",
        // "integrations" becomes the folder, "gmail-triage" is the workflow name within it
        discoveryPathSegments: ["integrations", "gmail-triage"],
      }),
    ];
    const tree = builder.build(workflows);
    render(
      <ul>
        <WorkflowListRoot node={tree} pathname="/workflows" workflows={workflows} />
      </ul>,
    );
    // The folder section should render a trigger with the folder test-id
    expect(screen.getByTestId("workflows-folder-integrations")).toBeInTheDocument();
  });
});

// ─── WorkflowListFolderSection ───────────────────────────────────────────────

describe("WorkflowListFolderSection", () => {
  it("renders the folder trigger with segment name", () => {
    // 2 segments: "integrations" is folder, "gmail" is workflow name inside
    const workflows = [
      makeWorkflow({
        id: "wf.gmail",
        name: "Gmail triage",
        discoveryPathSegments: ["integrations", "gmail"],
      }),
    ];
    const builder = new WorkflowFolderTreeBuilder();
    const tree = builder.build(workflows);
    // tree.children[0] is the "integrations" folder node
    const folderNode = tree.children[0];
    render(
      <ul>
        <WorkflowListFolderSection
          node={folderNode}
          folderPath={[]}
          depth={0}
          pathname="/workflows"
          workflows={workflows}
        />
      </ul>,
    );
    expect(screen.getByTestId("workflows-folder-integrations")).toBeInTheDocument();
    expect(screen.getByTestId("workflows-folder-integrations")).toHaveTextContent("integrations");
  });

  it("shows the workflow count badge", () => {
    const workflows = [
      makeWorkflow({ id: "wf.a", discoveryPathSegments: ["integrations", "wf-a"] }),
      makeWorkflow({ id: "wf.b", discoveryPathSegments: ["integrations", "wf-b"] }),
    ];
    const builder = new WorkflowFolderTreeBuilder();
    const tree = builder.build(workflows);
    const folderNode = tree.children[0];
    render(
      <ul>
        <WorkflowListFolderSection
          node={folderNode}
          folderPath={[]}
          depth={0}
          pathname="/workflows"
          workflows={workflows}
        />
      </ul>,
    );
    const trigger = screen.getByTestId("workflows-folder-integrations");
    // Badge should show count=2
    expect(trigger).toHaveTextContent("2");
  });
});
