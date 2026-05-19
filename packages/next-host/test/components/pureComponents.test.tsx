// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CodemationDataTable } from "../../src/components/CodemationDataTable";
import { CodemationFormattedDateTime } from "../../src/components/CodemationFormattedDateTime";
import { OauthProviderIcon } from "../../src/components/OauthProviderIcon";
import { TableRow, TableCell } from "../../src/components/ui/table";

// ─── CodemationDataTable ──────────────────────────────────────────────────────

describe("CodemationDataTable", () => {
  it("renders table with columns and children", () => {
    render(
      <CodemationDataTable
        tableTestId="my-table"
        columns={[
          { key: "name", header: "Name" },
          { key: "status", header: "Status" },
        ]}
      >
        <TableRow>
          <TableCell data-testid="cell-name">Test</TableCell>
          <TableCell>Active</TableCell>
        </TableRow>
      </CodemationDataTable>,
    );
    expect(screen.getByTestId("my-table")).toBeInTheDocument();
    expect(screen.getByTestId("codemation-table-header-name")).toHaveTextContent("Name");
    expect(screen.getByTestId("codemation-table-header-status")).toHaveTextContent("Status");
    expect(screen.getByTestId("cell-name")).toHaveTextContent("Test");
  });

  it("uses custom headerTestId when provided", () => {
    render(
      <CodemationDataTable
        tableTestId="table2"
        columns={[{ key: "email", header: "Email", headerTestId: "custom-email-header" }]}
      >
        <TableRow />
      </CodemationDataTable>,
    );
    expect(screen.getByTestId("custom-email-header")).toHaveTextContent("Email");
  });
});

// ─── CodemationFormattedDateTime ──────────────────────────────────────────────

describe("CodemationFormattedDateTime", () => {
  it("renders fallback text when isoUtc is null", () => {
    render(<CodemationFormattedDateTime isoUtc={null} dataTestId="dt-null" />);
    expect(screen.getByTestId("dt-null")).toHaveTextContent("—");
  });

  it("renders fallback text when isoUtc is empty string", () => {
    render(<CodemationFormattedDateTime isoUtc="" dataTestId="dt-empty" />);
    expect(screen.getByTestId("dt-empty")).toHaveTextContent("—");
  });

  it("renders custom fallback text", () => {
    render(<CodemationFormattedDateTime isoUtc={null} fallbackText="N/A" dataTestId="dt-custom" />);
    expect(screen.getByTestId("dt-custom")).toHaveTextContent("N/A");
  });

  it("renders fallback text when isoUtc is invalid", () => {
    render(<CodemationFormattedDateTime isoUtc="not-a-date" dataTestId="dt-invalid" />);
    expect(screen.getByTestId("dt-invalid")).toHaveTextContent("—");
  });

  it("renders formatted date for valid ISO string", () => {
    render(<CodemationFormattedDateTime isoUtc="2026-04-14T10:30:00.000Z" dataTestId="dt-valid" />);
    const el = screen.getByTestId("dt-valid");
    expect(el.tagName.toLowerCase()).toBe("time");
    expect(el).toHaveAttribute("dateTime", "2026-04-14T10:30:00.000Z");
    // Should contain year
    expect(el).toHaveTextContent("2026");
  });

  it("renders undefined isoUtc as fallback", () => {
    render(<CodemationFormattedDateTime isoUtc={undefined} dataTestId="dt-undef" />);
    expect(screen.getByTestId("dt-undef")).toHaveTextContent("—");
  });
});

// ─── OauthProviderIcon ────────────────────────────────────────────────────────

describe("OauthProviderIcon", () => {
  it("renders Google icon when providerId is 'google'", () => {
    render(<OauthProviderIcon providerId="google" testId="icon-google" />);
    expect(screen.getByTestId("icon-google")).toBeInTheDocument();
  });

  it("renders a generic SVG for non-google providers", () => {
    render(<OauthProviderIcon providerId="github" testId="icon-github" />);
    const el = screen.getByTestId("icon-github");
    expect(el.tagName.toLowerCase()).toBe("svg");
  });

  it("applies className to the rendered element", () => {
    render(<OauthProviderIcon providerId="github" className="my-icon-class" testId="icon-cls" />);
    expect(screen.getByTestId("icon-cls")).toHaveClass("my-icon-class");
  });
});
