// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NodeInspectorSummarySection } from "../../src/features/workflows/components/workflowDetail/NodeInspectorSummarySection";
import type { WorkflowDiagramNode } from "../../src/features/workflows/lib/workflowDetail/workflowDetailTypes";

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
});
