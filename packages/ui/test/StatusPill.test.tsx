import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StatusPill, type StatusKind } from "../src/components/StatusPill";

const KINDS: StatusKind[] = ["success", "warning", "danger", "neutral", "info"];

describe("StatusPill", () => {
  for (const kind of KINDS) {
    it(`renders ${kind} variant`, () => {
      render(<StatusPill status={kind} />);
      expect(screen.getByText(kind)).toBeInTheDocument();
    });
  }

  it("renders custom children", () => {
    render(<StatusPill status="success">All good</StatusPill>);
    expect(screen.getByText("All good")).toBeInTheDocument();
  });

  it("applies custom className", () => {
    render(<StatusPill status="info" className="custom-class" />);
    const el = screen.getByText("info");
    expect(el).toHaveClass("custom-class");
  });
});
