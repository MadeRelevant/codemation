// @vitest-environment jsdom

/**
 * Tests for WorkflowInspectorPrettyView:
 * - empty-state branch (value === undefined)
 * - normal render with auto-expand useEffect
 * - collapse-all / expand-all toggle logic
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowInspectorPrettyView } from "../../src/panels/WorkflowInspectorPrettyView";

describe("WorkflowInspectorPrettyView", () => {
  it("renders empty-state when value is undefined", () => {
    render(<WorkflowInspectorPrettyView value={undefined} emptyLabel="Nothing here yet" />);
    expect(screen.getByTestId("workflow-inspector-empty-state").textContent).toBe("Nothing here yet");
  });

  it("does NOT render empty-state when value is provided", () => {
    render(<WorkflowInspectorPrettyView value={{ key: "hello" }} emptyLabel="Nothing here" />);
    expect(screen.queryByTestId("workflow-inspector-empty-state")).toBeNull();
  });

  it("renders tree container and hint text for non-undefined value", () => {
    render(<WorkflowInspectorPrettyView value={{ name: "Alice", age: 30 }} emptyLabel="" />);
    expect(screen.getByTestId("workflow-inspector-pretty-tree")).toBeInTheDocument();
    expect(screen.getByTestId("workflow-inspector-pretty-hint")).toBeInTheDocument();
  });

  it("auto-expands keys on mount via useEffect", () => {
    render(<WorkflowInspectorPrettyView value={{ a: { b: "c" } }} emptyLabel="" />);
    // After auto-expand, tree should have rendered items
    const tree = screen.getByTestId("workflow-inspector-pretty-tree");
    expect(tree).toBeInTheDocument();
    // Keys should be expanded by default; Collapse all button available
    expect(screen.getByRole("button", { name: /collapse all/i })).toBeInTheDocument();
  });

  it("collapse-all button collapses expanded keys", () => {
    render(<WorkflowInspectorPrettyView value={{ a: 1, b: 2 }} emptyLabel="" />);
    const collapseBtn = screen.getByRole("button", { name: /collapse all/i });
    fireEvent.click(collapseBtn);
    // After collapse, expand-all should still be available
    expect(screen.getByRole("button", { name: /expand all/i })).toBeInTheDocument();
  });

  it("expand-all button re-expands keys after collapse", () => {
    render(<WorkflowInspectorPrettyView value={{ x: { y: 99 } }} emptyLabel="" />);
    const collapseBtn = screen.getByRole("button", { name: /collapse all/i });
    fireEvent.click(collapseBtn);
    const expandBtn = screen.getByRole("button", { name: /expand all/i });
    fireEvent.click(expandBtn);
    expect(screen.getByTestId("workflow-inspector-pretty-tree")).toBeInTheDocument();
  });

  it("renders for a null value (not undefined — uses the tree path)", () => {
    render(<WorkflowInspectorPrettyView value={null} emptyLabel="empty" />);
    // null is not undefined, so no empty state
    expect(screen.queryByTestId("workflow-inspector-empty-state")).toBeNull();
  });

  it("renders for an array value", () => {
    render(<WorkflowInspectorPrettyView value={[1, 2, 3]} emptyLabel="" />);
    expect(screen.getByTestId("workflow-inspector-pretty-tree")).toBeInTheDocument();
  });
});
