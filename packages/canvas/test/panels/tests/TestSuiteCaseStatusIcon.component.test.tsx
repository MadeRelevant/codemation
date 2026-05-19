// @vitest-environment jsdom

/**
 * Component rendering and statusLabelFor tests for TestSuiteCaseStatusIcon.
 * resolveDisplayedCaseStatus pure-function tests live in TestSuiteCaseStatusIcon.test.ts.
 */

import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";

import {
  TestSuiteCaseStatusIcon,
  statusLabelFor,
  type DisplayedCaseStatus,
} from "../../../src/panels/tests/TestSuiteCaseStatusIcon";

const ALL_STATUSES: DisplayedCaseStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "errored",
  "cancelled",
  "completed",
];

describe("TestSuiteCaseStatusIcon — component renders without throwing", () => {
  for (const status of ALL_STATUSES) {
    it(`renders icon for status "${status}"`, () => {
      const { container } = render(<TestSuiteCaseStatusIcon status={status} />);
      // Should render an SVG icon with the correct aria-label
      const svg = container.querySelector("svg");
      expect(svg).not.toBeNull();
    });
  }

  it("uses provided className instead of default size-4", () => {
    const { container } = render(<TestSuiteCaseStatusIcon status="queued" className="custom-cls" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("custom-cls");
  });

  it("uses default size-4 class when className is not provided", () => {
    const { container } = render(<TestSuiteCaseStatusIcon status="queued" />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("size-4");
  });

  it("renders fallback unknown icon for an unrecognised status (default branch)", () => {
    // Cast to bypass TS union constraint and hit the switch default branch.
    const { container } = render(<TestSuiteCaseStatusIcon status={"unknown-status" as DisplayedCaseStatus} />);
    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("aria-label")).toBe("unknown");
  });
});

describe("statusLabelFor", () => {
  it.each<[DisplayedCaseStatus, string]>([
    ["queued", "Queued"],
    ["running", "Running"],
    ["succeeded", "Succeeded"],
    ["completed", "Completed"],
    ["failed", "Failed"],
    ["errored", "Errored"],
    ["cancelled", "Cancelled"],
  ])('returns "%s" for status %s', (status, expected) => {
    expect(statusLabelFor(status)).toBe(expected);
  });
});
