// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NodeInspectorSummaryRow } from "../../src/panels/NodeInspectorSummaryRow";
import { NodeInspectorSummarySection } from "../../src/panels/NodeInspectorSummarySection";
import type { WorkflowDiagramNode } from "@codemation/canvas";

describe("NodeInspectorSummaryRow", () => {
  it("renders label and value", () => {
    render(
      <dl>
        <NodeInspectorSummaryRow label="Model" value="gpt-4o" />
      </dl>,
    );
    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
  });

  it("renders long values without error", () => {
    const longValue = "line one line two line three";
    render(
      <dl>
        <NodeInspectorSummaryRow label="Prompt" value={longValue} />
      </dl>,
    );
    expect(screen.getByText(longValue)).toBeInTheDocument();
  });

  it("renders empty value without error", () => {
    render(
      <dl>
        <NodeInspectorSummaryRow label="Key" value="" />
      </dl>,
    );
    expect(screen.getByText("Key")).toBeInTheDocument();
  });
});

describe("NodeInspectorSummarySection", () => {
  function makeNode(
    inspectorSummary: ReadonlyArray<{ label: string; value: string }> | undefined,
  ): WorkflowDiagramNode {
    return {
      id: "n1",
      type: "SomeNode",
      inspectorSummary,
    } as unknown as WorkflowDiagramNode;
  }

  it("returns null when inspectorSummary is undefined", () => {
    const { container } = render(<NodeInspectorSummarySection node={makeNode(undefined)} />);
    expect(container.firstChild).toBeNull();
  });

  it("returns null when inspectorSummary is empty array", () => {
    const { container } = render(<NodeInspectorSummarySection node={makeNode([])} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the summary section when rows exist", () => {
    render(<NodeInspectorSummarySection node={makeNode([{ label: "Model", value: "gpt-4o" }])} />);
    expect(screen.getByTestId("node-properties-inspector-summary-section")).toBeInTheDocument();
    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o")).toBeInTheDocument();
  });

  it("renders multiple rows", () => {
    render(
      <NodeInspectorSummarySection
        node={makeNode([
          { label: "Model", value: "gpt-4o" },
          { label: "Temperature", value: "0.7" },
        ])}
      />,
    );
    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.getByText("Temperature")).toBeInTheDocument();
  });
});
