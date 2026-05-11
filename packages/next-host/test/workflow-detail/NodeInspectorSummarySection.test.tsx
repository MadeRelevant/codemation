// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NodeInspectorSummaryRow } from "@codemation/canvas";
import { NodeInspectorSummarySection } from "@codemation/canvas";
import type { WorkflowDiagramNode } from "@codemation/canvas";

function nodeWithSummary(summary: WorkflowDiagramNode["inspectorSummary"]): WorkflowDiagramNode {
  return {
    id: "node_1",
    kind: "node",
    type: "Test",
    inspectorSummary: summary,
  } as WorkflowDiagramNode;
}

describe("NodeInspectorSummarySection", () => {
  it("renders nothing when the node has no inspectorSummary", () => {
    const { container } = render(<NodeInspectorSummarySection node={nodeWithSummary(undefined)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when inspectorSummary is an empty array", () => {
    const { container } = render(<NodeInspectorSummarySection node={nodeWithSummary([])} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders one row per label/value pair under a 'Configuration' heading", () => {
    render(
      <NodeInspectorSummarySection
        node={nodeWithSummary([
          { label: "Method", value: "POST" },
          { label: "URL", value: "https://api.example.com/endpoint" },
        ])}
      />,
    );
    expect(screen.getByText("Configuration")).toBeDefined();
    expect(screen.getByText("Method")).toBeDefined();
    expect(screen.getByText("POST")).toBeDefined();
    expect(screen.getByText("URL")).toBeDefined();
    expect(screen.getByText("https://api.example.com/endpoint")).toBeDefined();
  });

  it("preserves multi-line value content (prompt previews etc.) via whitespace-pre-wrap", () => {
    const { container } = render(
      <NodeInspectorSummarySection node={nodeWithSummary([{ label: "Prompt", value: "Line one\nLine two" }])} />,
    );
    const dd = container.querySelector("dd");
    expect(dd?.textContent).toBe("Line one\nLine two");
  });

  it("renders a single row when only one is provided (no extra wrappers)", () => {
    const { container } = render(
      <NodeInspectorSummarySection node={nodeWithSummary([{ label: "Method", value: "GET" }])} />,
    );
    const dts = container.querySelectorAll("dt");
    const dds = container.querySelectorAll("dd");
    expect(dts.length).toBe(1);
    expect(dds.length).toBe(1);
    expect(dts[0]?.textContent).toBe("Method");
    expect(dds[0]?.textContent).toBe("GET");
  });

  it("emits stable keys per row (label + index) — duplicate labels do not collide", () => {
    const { container } = render(
      <NodeInspectorSummarySection
        node={nodeWithSummary([
          { label: "Header", value: "Authorization: Bearer ..." },
          { label: "Header", value: "Content-Type: application/json" },
        ])}
      />,
    );
    expect(container.querySelectorAll("dt").length).toBe(2);
    expect(container.querySelectorAll("dd").length).toBe(2);
  });
});

describe("NodeInspectorSummaryRow", () => {
  it("renders the label in a <dt> and the value in a <dd>", () => {
    const { container } = render(<NodeInspectorSummaryRow label="URL" value="https://api.example.com" />);
    const dt = container.querySelector("dt");
    const dd = container.querySelector("dd");
    expect(dt?.textContent).toBe("URL");
    expect(dd?.textContent).toBe("https://api.example.com");
  });
});
