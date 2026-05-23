// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NodePropertiesTimelineRenderer } from "../../src/panels/NodePropertiesTimelineRenderer";

function makePill(label: string, value: string) {
  return { label, value };
}

function makeJsonBlock(label: string, value: unknown) {
  return { label, value };
}

const renderPill = (pill: Readonly<{ label: string; value: string }>, key: string) => (
  <span key={key} data-testid={`pill-${key}`}>
    {pill.label}: {pill.value}
  </span>
);

const renderJsonBlock = (block: Readonly<{ label: string; value: unknown }>, index: number) => (
  <div key={index} data-testid={`json-block-${index}`}>
    {block.label}
  </div>
);

function makeEntry(overrides = {}): Parameters<typeof NodePropertiesTimelineRenderer.render>[0] {
  return {
    key: "entry-1",
    kind: "tool" as const,
    title: "Tool Call",
    subtitle: undefined,
    pills: undefined,
    jsonBlocks: undefined,
    children: undefined,
    ...overrides,
  };
}

describe("NodePropertiesTimelineRenderer.render", () => {
  it("renders the entry with its title", () => {
    render(
      <div>
        {NodePropertiesTimelineRenderer.render(makeEntry({ key: "e1", title: "HTTP Request" }), {
          isLast: true,
          renderPill,
          renderJsonBlock,
        })}
      </div>,
    );
    expect(screen.getByTestId("node-properties-timeline-entry-e1")).toBeInTheDocument();
    expect(screen.getByText("HTTP Request")).toBeInTheDocument();
  });

  it("renders agent kind icon", () => {
    render(
      <div>
        {NodePropertiesTimelineRenderer.render(makeEntry({ key: "e2", kind: "agent" }), {
          isLast: true,
          renderPill,
          renderJsonBlock,
        })}
      </div>,
    );
    expect(screen.getByTestId("node-properties-timeline-entry-icon-e2-agent")).toBeInTheDocument();
  });

  it("renders tool kind icon", () => {
    render(
      <div>
        {NodePropertiesTimelineRenderer.render(makeEntry({ key: "e3", kind: "tool" }), {
          isLast: true,
          renderPill,
          renderJsonBlock,
        })}
      </div>,
    );
    expect(screen.getByTestId("node-properties-timeline-entry-icon-e3-tool")).toBeInTheDocument();
  });

  it("renders pills when provided", () => {
    const entry = makeEntry({
      key: "e4",
      pills: [makePill("Status", "completed")],
    });
    render(<div>{NodePropertiesTimelineRenderer.render(entry, { isLast: true, renderPill, renderJsonBlock })}</div>);
    expect(screen.getByTestId("node-properties-timeline-entry-pills-e4")).toBeInTheDocument();
  });

  it("renders json blocks when provided", () => {
    const entry = makeEntry({
      key: "e5",
      jsonBlocks: [makeJsonBlock("Input", { foo: "bar" })],
    });
    render(<div>{NodePropertiesTimelineRenderer.render(entry, { isLast: true, renderPill, renderJsonBlock })}</div>);
    expect(screen.getByTestId("json-block-0")).toBeInTheDocument();
  });

  it("renders subtitle when provided", () => {
    const entry = makeEntry({ key: "e6", subtitle: "Tool subtitle text" });
    render(<div>{NodePropertiesTimelineRenderer.render(entry, { isLast: true, renderPill, renderJsonBlock })}</div>);
    expect(screen.getByText("Tool subtitle text")).toBeInTheDocument();
  });

  it("renders children recursively", () => {
    const entry = makeEntry({
      key: "parent",
      title: "Parent Tool",
      children: [makeEntry({ key: "child-1", title: "Child Tool" })],
    });
    render(<div>{NodePropertiesTimelineRenderer.render(entry, { isLast: true, renderPill, renderJsonBlock })}</div>);
    expect(screen.getByTestId("node-properties-timeline-entry-children-parent")).toBeInTheDocument();
    expect(screen.getByTestId("node-properties-timeline-entry-child-1")).toBeInTheDocument();
  });

  it("renders the connecting line elements when isLast is false", () => {
    const entry = makeEntry({ key: "e7" });
    const { container } = render(
      <div>{NodePropertiesTimelineRenderer.render(entry, { isLast: false, renderPill, renderJsonBlock })}</div>,
    );
    // The ArrowDown and the vertical line appear only when !isLast
    const svgs = container.querySelectorAll("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });
});
