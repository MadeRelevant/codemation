// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NodePropertiesSectionRenderer } from "../../src/panels/NodePropertiesSectionRenderer";

describe("NodePropertiesSectionRenderer.renderStatusPill", () => {
  it("renders completed pill with check icon", () => {
    const { container } = render(NodePropertiesSectionRenderer.renderStatusPill("completed", "k1"));
    expect(container.textContent).toContain("completed");
    // completed uses emerald classes
    expect(container.firstChild).toHaveClass("text-emerald-700");
  });

  it("renders failed pill with destructive styling", () => {
    const { container } = render(NodePropertiesSectionRenderer.renderStatusPill("failed", "k2"));
    expect(container.textContent).toContain("failed");
    expect(container.firstChild).toHaveClass("text-destructive");
  });

  it("renders running pill with primary styling", () => {
    const { container } = render(NodePropertiesSectionRenderer.renderStatusPill("running", "k3"));
    expect(container.textContent).toContain("running");
    expect(container.firstChild).toHaveClass("text-primary");
  });

  it("renders queued pill with primary styling (same branch as running)", () => {
    const { container } = render(NodePropertiesSectionRenderer.renderStatusPill("queued", "k4"));
    expect(container.textContent).toContain("queued");
    expect(container.firstChild).toHaveClass("text-primary");
  });

  it("renders default pill for unknown status", () => {
    const { container } = render(NodePropertiesSectionRenderer.renderStatusPill("skipped", "k5"));
    expect(container.textContent).toContain("skipped");
    // default pill has border-border/70
    expect(container.firstChild).not.toHaveClass("text-destructive");
    expect(container.firstChild).not.toHaveClass("text-primary");
    expect(container.firstChild).not.toHaveClass("text-emerald-700");
  });

  it("case-insensitively matches COMPLETED", () => {
    const { container } = render(NodePropertiesSectionRenderer.renderStatusPill("COMPLETED", "k6"));
    expect(container.firstChild).toHaveClass("text-emerald-700");
  });
});

describe("NodePropertiesSectionRenderer.renderPill", () => {
  it("delegates Status label to renderStatusPill", () => {
    const { container } = render(
      NodePropertiesSectionRenderer.renderPill({ label: "Status", value: "completed" }, "p1"),
    );
    expect(container.firstChild).toHaveClass("text-emerald-700");
  });

  it("renders a generic pill for non-Status labels", () => {
    const { container } = render(NodePropertiesSectionRenderer.renderPill({ label: "Duration", value: "2.3s" }, "p2"));
    expect(container.textContent).toContain("Duration");
    expect(container.textContent).toContain("2.3s");
  });
});

describe("NodePropertiesSectionRenderer.renderJsonBlock", () => {
  it("renders label and JSON-stringified value", () => {
    const { container } = render(
      NodePropertiesSectionRenderer.renderJsonBlock({ label: "Input", value: { key: "val" } }, 0),
    );
    expect(container.textContent).toContain("Input");
    expect(container.textContent).toContain('"key"');
    expect(container.textContent).toContain('"val"');
  });

  it("renders null value as 'null'", () => {
    const { container } = render(NodePropertiesSectionRenderer.renderJsonBlock({ label: "Output", value: null }, 1));
    expect(container.textContent).toContain("null");
  });
});

describe("NodePropertiesSectionRenderer.renderTable", () => {
  it("renders table headers and rows", () => {
    const table = {
      columns: ["Name", "Value"],
      rows: [
        { Name: "foo", Value: "bar" },
        { Name: "baz", Value: "qux" },
      ],
    };
    render(<div>{NodePropertiesSectionRenderer.renderTable(table)}</div>);
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Value")).toBeInTheDocument();
    expect(screen.getByText("foo")).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
  });

  it("renders — when a cell value is missing", () => {
    const table = {
      columns: ["Name", "Value"],
      rows: [{ Name: "foo" } as Record<string, string>],
    };
    render(<div>{NodePropertiesSectionRenderer.renderTable(table)}</div>);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("NodePropertiesSectionRenderer.render", () => {
  function makeSection(overrides = {}) {
    return {
      id: "section-1",
      title: "Output",
      pills: undefined,
      keyValues: undefined,
      table: undefined,
      timeline: undefined,
      jsonBlocks: undefined,
      navigation: undefined,
      breadcrumb: undefined,
      description: undefined,
      emptyLabel: undefined,
      ...overrides,
    };
  }

  it("renders section title", () => {
    render(
      <div>
        {NodePropertiesSectionRenderer.render({
          section: makeSection({ title: "My Section" }),
          isOpen: true,
          onToggle: () => {},
          isLastSection: true,
        })}
      </div>,
    );
    expect(screen.getByText("My Section")).toBeInTheDocument();
  });

  it("renders with testId from section.id", () => {
    render(
      <div>
        {NodePropertiesSectionRenderer.render({
          section: makeSection({ id: "out-sec" }),
          isOpen: true,
          onToggle: () => {},
          isLastSection: false,
        })}
      </div>,
    );
    expect(screen.getByTestId("node-properties-section-out-sec")).toBeInTheDocument();
  });

  it("calls onToggle when collapsible trigger is clicked", () => {
    const onToggle = vi.fn();
    render(
      <div>
        {NodePropertiesSectionRenderer.render({
          section: makeSection({ id: "toggle-sec" }),
          isOpen: true,
          onToggle,
          isLastSection: true,
        })}
      </div>,
    );
    // Click the CollapsibleTrigger (the section title area)
    const trigger = screen.getByText("Output");
    fireEvent.click(trigger);
    expect(onToggle).toHaveBeenCalled();
  });

  it("renders pills when section.pills is set", () => {
    render(
      <div>
        {NodePropertiesSectionRenderer.render({
          section: makeSection({ pills: [{ label: "Status", value: "completed" }] }),
          isOpen: true,
          onToggle: () => {},
          isLastSection: true,
        })}
      </div>,
    );
    expect(screen.getByText("completed")).toBeInTheDocument();
  });

  it("renders keyValues when section.keyValues is set", () => {
    render(
      <div>
        {NodePropertiesSectionRenderer.render({
          section: makeSection({ keyValues: [{ label: "Node ID", value: "node-1" }] }),
          isOpen: true,
          onToggle: () => {},
          isLastSection: true,
        })}
      </div>,
    );
    expect(screen.getByText("Node ID")).toBeInTheDocument();
    expect(screen.getByText("node-1")).toBeInTheDocument();
  });

  it("renders emptyLabel when no content sections", () => {
    render(
      <div>
        {NodePropertiesSectionRenderer.render({
          section: makeSection({ emptyLabel: "Nothing to display" }),
          isOpen: true,
          onToggle: () => {},
          isLastSection: true,
        })}
      </div>,
    );
    expect(screen.getByText("Nothing to display")).toBeInTheDocument();
  });

  it("renders breadcrumb when provided", () => {
    render(
      <div>
        {NodePropertiesSectionRenderer.render({
          section: makeSection({
            id: "bread-sec",
            breadcrumb: { text: "Run 3 of 5" },
          }),
          isOpen: true,
          onToggle: () => {},
          isLastSection: true,
        })}
      </div>,
    );
    expect(screen.getByTestId("node-properties-section-breadcrumb-bread-sec").textContent).toBe("Run 3 of 5");
  });

  it("renders description when provided", () => {
    render(
      <div>
        {NodePropertiesSectionRenderer.render({
          section: makeSection({ description: "Desc text" }),
          isOpen: true,
          onToggle: () => {},
          isLastSection: true,
        })}
      </div>,
    );
    expect(screen.getByText("Desc text")).toBeInTheDocument();
  });
});
