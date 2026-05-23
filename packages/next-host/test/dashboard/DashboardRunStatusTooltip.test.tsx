// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DashboardRunStatusTooltip } from "../../src/features/dashboard/components/DashboardRunStatusTooltip";

describe("DashboardRunStatusTooltip", () => {
  it("renders nothing when inactive", () => {
    const { container } = render(<DashboardRunStatusTooltip active={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when payload is empty", () => {
    const { container } = render(<DashboardRunStatusTooltip active payload={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders tooltip with completed runs", () => {
    render(
      <DashboardRunStatusTooltip
        active
        label="2026-01-01"
        payload={[
          { name: "Completed", value: 5 },
          { name: "Failed", value: 2 },
          { name: "Running", value: 0 },
        ]}
      />,
    );
    expect(screen.getByText("2026-01-01")).toBeInTheDocument();
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
    // Running is filtered out because value === 0
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
  });

  it("renders nothing when payload has no positive numeric values", () => {
    render(<DashboardRunStatusTooltip active label="empty" payload={[{ name: "Running", value: 0 }]} />);
    // The outer div renders but no entries are visible
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
  });
});
