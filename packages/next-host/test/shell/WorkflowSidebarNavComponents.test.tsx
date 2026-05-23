// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowSidebarNavTree } from "../../src/shell/WorkflowSidebarNavTree";
import { WorkflowSidebarNavFolder } from "../../src/shell/WorkflowSidebarNavFolder";
import { WorkflowFolderTreeBuilder } from "../../src/shell/WorkflowFolderTreeBuilder";
import type { WorkflowSummary } from "@codemation/canvas";
import { cn } from "../../src/lib/utils";

// Note on WorkflowFolderTreeBuilder segment logic:
// A workflow with 1 segment goes directly to root.workflows.
// A workflow with 2+ segments: first N-1 segments become folder nodes,
// last segment is the "workflow name in folder" label (not another node).
// So to create a folder "integrations" you need segments like ["integrations", "workflow-name"].

function makeWorkflow(overrides: Partial<WorkflowSummary> = {}): WorkflowSummary {
  return {
    id: "wf.test",
    name: "Test Workflow",
    active: true,
    discoveryPathSegments: [],
    ...overrides,
  };
}

function linkClass(isActive: boolean): string {
  return cn("nav-link", isActive && "active");
}

// ─── WorkflowSidebarNavTree ───────────────────────────────────────────────────

describe("WorkflowSidebarNavTree", () => {
  it("renders nav links for root-level workflows", () => {
    const workflows = [
      makeWorkflow({ id: "wf.a", name: "Alpha", discoveryPathSegments: [] }),
      makeWorkflow({ id: "wf.b", name: "Beta", discoveryPathSegments: [] }),
    ];
    render(<WorkflowSidebarNavTree workflows={workflows} pathname="/workflows" workflowLinkClass={linkClass} />);
    expect(screen.getByTestId("nav-workflow-wf.a")).toBeInTheDocument();
    expect(screen.getByTestId("nav-workflow-wf.b")).toBeInTheDocument();
  });

  it("marks the active workflow link", () => {
    const workflows = [makeWorkflow({ id: "wf.active" })];
    render(
      <WorkflowSidebarNavTree workflows={workflows} pathname="/workflows/wf.active" workflowLinkClass={linkClass} />,
    );
    expect(screen.getByTestId("nav-workflow-wf.active")).toHaveClass("active");
  });

  it("renders folder sections for workflows with 2+ path segments", () => {
    // "integrations" folder contains workflow with segments ["integrations", "gmail-triage"]
    const workflows = [
      makeWorkflow({
        id: "wf.nested",
        name: "Gmail triage",
        discoveryPathSegments: ["integrations", "gmail-triage"],
      }),
    ];
    render(<WorkflowSidebarNavTree workflows={workflows} pathname="/workflows" workflowLinkClass={linkClass} />);
    expect(screen.getByTestId("nav-workflow-folder-integrations")).toBeInTheDocument();
  });

  it("hides text labels in collapsed mode and adds aria-labels", () => {
    const workflows = [makeWorkflow({ id: "wf.a", name: "Alpha", discoveryPathSegments: [] })];
    render(
      <WorkflowSidebarNavTree workflows={workflows} pathname="/workflows" workflowLinkClass={linkClass} collapsed />,
    );
    // In collapsed mode, the link should have an aria-label instead of visible text
    expect(screen.getByTestId("nav-workflow-wf.a")).toHaveAttribute("aria-label", "Alpha");
  });

  it("renders tree container element", () => {
    render(<WorkflowSidebarNavTree workflows={[]} pathname="/workflows" workflowLinkClass={linkClass} />);
    expect(screen.getByTestId("workflow-sidebar-nav-tree")).toBeInTheDocument();
  });
});

// ─── WorkflowSidebarNavFolder ─────────────────────────────────────────────────

describe("WorkflowSidebarNavFolder", () => {
  const builder = new WorkflowFolderTreeBuilder();

  function buildFolderNode(workflows: WorkflowSummary[]) {
    const tree = builder.build(workflows);
    return tree.children[0]; // First folder child
  }

  it("renders the folder trigger with segment label", () => {
    const workflows = [
      makeWorkflow({
        id: "wf.nested",
        name: "Nested WF",
        discoveryPathSegments: ["integrations", "nested"],
      }),
    ];
    const folder = buildFolderNode(workflows);
    render(
      <WorkflowSidebarNavFolder
        node={folder}
        pathPrefix={[]}
        pathname="/workflows"
        workflows={workflows}
        workflowLinkClass={linkClass}
        depth={0}
      />,
    );
    const trigger = screen.getByTestId("nav-workflow-folder-integrations");
    expect(trigger).toBeInTheDocument();
    expect(trigger).toHaveTextContent("integrations");
  });

  it("renders workflow links inside the folder", () => {
    const workflows = [
      makeWorkflow({
        id: "wf.gmail",
        name: "Gmail",
        discoveryPathSegments: ["integrations", "gmail"],
      }),
    ];
    const folder = buildFolderNode(workflows);
    render(
      <WorkflowSidebarNavFolder
        node={folder}
        pathPrefix={[]}
        pathname="/workflows"
        workflows={workflows}
        workflowLinkClass={linkClass}
        depth={0}
      />,
    );
    expect(screen.getByTestId("nav-workflow-wf.gmail")).toBeInTheDocument();
  });

  it("marks the active workflow link within the folder", () => {
    const workflows = [
      makeWorkflow({
        id: "wf.active",
        discoveryPathSegments: ["integrations", "active"],
      }),
    ];
    const folder = buildFolderNode(workflows);
    render(
      <WorkflowSidebarNavFolder
        node={folder}
        pathPrefix={[]}
        pathname="/workflows/wf.active"
        workflows={workflows}
        workflowLinkClass={linkClass}
        depth={0}
      />,
    );
    expect(screen.getByTestId("nav-workflow-wf.active")).toHaveClass("active");
  });

  it("renders in collapsed mode with aria-label on the trigger", () => {
    const workflows = [
      makeWorkflow({
        id: "wf.item",
        discoveryPathSegments: ["integrations", "item"],
      }),
    ];
    const folder = buildFolderNode(workflows);
    render(
      <WorkflowSidebarNavFolder
        node={folder}
        pathPrefix={[]}
        pathname="/workflows"
        workflows={workflows}
        workflowLinkClass={linkClass}
        depth={0}
        collapsed
      />,
    );
    const trigger = screen.getByTestId("nav-workflow-folder-integrations");
    expect(trigger).toHaveAttribute("aria-label", "integrations");
  });

  it("shows workflow count in expanded mode", () => {
    const workflows = [
      makeWorkflow({ id: "wf.1", discoveryPathSegments: ["integrations", "wf-1"] }),
      makeWorkflow({ id: "wf.2", discoveryPathSegments: ["integrations", "wf-2"] }),
    ];
    const folder = buildFolderNode(workflows);
    render(
      <WorkflowSidebarNavFolder
        node={folder}
        pathPrefix={[]}
        pathname="/workflows"
        workflows={workflows}
        workflowLinkClass={linkClass}
        depth={0}
      />,
    );
    // Count badge visible in non-collapsed mode
    const trigger = screen.getByTestId("nav-workflow-folder-integrations");
    expect(trigger).toHaveTextContent("2");
  });
});
