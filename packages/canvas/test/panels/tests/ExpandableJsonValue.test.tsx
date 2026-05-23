import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ExpandableJsonValue } from "../../../src/panels/tests/ExpandableJsonValue";

describe("ExpandableJsonValue", () => {
  it("renders short values without expand button", () => {
    render(<ExpandableJsonValue value={{ key: "short" }} />);
    expect(screen.getByText(/short/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders long values with a show more button", () => {
    const longObject = { key: "x".repeat(200) };
    render(<ExpandableJsonValue value={longObject} />);
    expect(screen.getByRole("button", { name: /show more/i })).toBeInTheDocument();
  });

  it("expands and shows full content when show more is clicked", () => {
    const longValue = "x".repeat(200);
    render(<ExpandableJsonValue value={longValue} />);
    const button = screen.getByRole("button", { name: /show more/i });
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: /hide/i })).toBeInTheDocument();
    // The full value should be visible
    expect(screen.getByText(new RegExp("x".repeat(50)))).toBeInTheDocument();
  });

  it("renders undefined as dash", () => {
    render(<ExpandableJsonValue value={undefined} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
