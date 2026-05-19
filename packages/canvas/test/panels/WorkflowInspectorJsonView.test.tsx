// @vitest-environment jsdom

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowInspectorJsonView } from "../../src/panels/WorkflowInspectorJsonView";

describe("WorkflowInspectorJsonView", () => {
  it("renders empty state when value is undefined", () => {
    render(<WorkflowInspectorJsonView value={undefined} emptyLabel="No output yet" />);
    expect(screen.getByTestId("workflow-inspector-empty-state").textContent).toBe("No output yet");
  });

  it("renders the JSON panel when value is an object", () => {
    render(<WorkflowInspectorJsonView value={{ name: "Alice" }} emptyLabel="" />);
    expect(screen.getByTestId("workflow-inspector-json-panel")).toBeInTheDocument();
  });

  it("renders a <pre> when value is a primitive (non-renderable JSON)", () => {
    render(<WorkflowInspectorJsonView value="a plain string" emptyLabel="" />);
    const panel = screen.getByTestId("workflow-inspector-json-panel");
    expect(panel.querySelector("pre")).not.toBeNull();
  });

  it("shows 'Use the copy icon' hint initially", () => {
    render(<WorkflowInspectorJsonView value={{ x: 1 }} emptyLabel="" />);
    expect(screen.getByTestId("workflow-inspector-json-copy-hint").textContent).toContain("copy icon");
  });

  it("Collapse all button is present when value is not undefined", () => {
    render(<WorkflowInspectorJsonView value={{ a: 1 }} emptyLabel="" />);
    expect(screen.getByText("Collapse all")).toBeInTheDocument();
    expect(screen.getByText("Expand all")).toBeInTheDocument();
  });

  it("clicking Collapse all and Expand all do not throw", () => {
    render(<WorkflowInspectorJsonView value={{ a: 1 }} emptyLabel="" />);
    fireEvent.click(screen.getByText("Collapse all"));
    fireEvent.click(screen.getByText("Expand all"));
    expect(screen.getByTestId("workflow-inspector-json-panel")).toBeInTheDocument();
  });
});
