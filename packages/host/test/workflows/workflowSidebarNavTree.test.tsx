import { WorkflowSidebarNavTree } from "@codemation/next-host/src/shell/WorkflowSidebarNavTree";
import type { WorkflowSummary } from "@codemation/host-src/application/contracts/WorkflowViewContracts";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

function wf(args: Readonly<{ id: string; name: string; discoveryPathSegments: readonly string[] }>): WorkflowSummary {
  return {
    id: args.id,
    name: args.name,
    active: false,
    discoveryPathSegments: args.discoveryPathSegments,
  };
}

describe("WorkflowSidebarNavTree", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders folder nodes from discoveryPathSegments (nested tree, not a flat list)", () => {
    const workflowLinkClass = (active: boolean): string => (active ? "is-active" : "is-idle");
    render(
      <WorkflowSidebarNavTree
        workflows={[
          wf({ id: "wf.alpha", name: "Alpha", discoveryPathSegments: ["integrations", "alpha"] }),
          wf({ id: "wf.beta", name: "Beta", discoveryPathSegments: ["integrations", "beta"] }),
        ]}
        pathname="/workflows"
        workflowLinkClass={workflowLinkClass}
      />,
    );

    expect(screen.getByTestId("workflow-sidebar-nav-tree")).toBeInTheDocument();
    expect(screen.getByTestId("nav-workflow-folder-integrations")).toBeInTheDocument();
    expect(screen.getByTestId("nav-workflow-wf.alpha")).toBeInTheDocument();
    expect(screen.getByTestId("nav-workflow-wf.beta")).toBeInTheDocument();
  });

  it("supports collapsed (icon-only) layout without dropping folder structure", () => {
    const workflowLinkClass = (): string => "collapsed-link";
    render(
      <WorkflowSidebarNavTree
        workflows={[wf({ id: "wf.nested", name: "Nested", discoveryPathSegments: ["tutorials", "demo"] })]}
        pathname="/workflows"
        workflowLinkClass={workflowLinkClass}
        collapsed
      />,
    );

    expect(screen.getByTestId("nav-workflow-folder-tutorials")).toBeInTheDocument();
    expect(screen.getByTestId("nav-workflow-wf.nested")).toBeInTheDocument();
  });
});
