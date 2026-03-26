// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CanvasNodeChromeTooltip } from "../src/features/workflows/components/canvas/CanvasNodeChromeTooltip";

describe("CanvasNodeChromeTooltip", () => {
  beforeEach(() => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      width: 40,
      height: 32,
      top: 50,
      left: 100,
      bottom: 82,
      right: 140,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    } as DOMRect);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the tooltip below the anchor so header-adjacent icons stay visible", () => {
    render(
      <CanvasNodeChromeTooltip testId="chrome-tooltip-anchor" ariaLabel="Test" tooltip="Line one\nLine two">
        <span data-testid="chrome-tooltip-child">icon</span>
      </CanvasNodeChromeTooltip>,
    );

    fireEvent.pointerEnter(screen.getByTestId("chrome-tooltip-anchor"));

    const tooltip = screen.getByRole("tooltip", { hidden: true });
    expect(tooltip).toHaveTextContent("Line one");
    expect(tooltip).toHaveStyle({
      top: "82px",
      left: "120px",
      transform: "translate(-50%, 8px)",
    });
  });
});
