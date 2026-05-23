// @vitest-environment jsdom

import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CanvasNodeIconSlot } from "../../src/canvas/CanvasNodeIconSlot";

describe("CanvasNodeIconSlot", () => {
  it("renders children inside a span with the given size", () => {
    const { container } = render(
      <CanvasNodeIconSlot sizePx={24}>
        <span data-testid="child">icon</span>
      </CanvasNodeIconSlot>,
    );
    expect(screen.getByTestId("child")).toBeInTheDocument();
    const slot = container.firstChild as HTMLElement;
    expect(slot.style.width).toBe("24px");
    expect(slot.style.height).toBe("24px");
  });

  it("wraps children in rotate span when rotate is provided", () => {
    render(
      <CanvasNodeIconSlot sizePx={24} rotate={90}>
        <span data-testid="rotated-child">icon</span>
      </CanvasNodeIconSlot>,
    );
    const child = screen.getByTestId("rotated-child");
    // Parent should be a rotated wrapper span
    const wrapper = child.parentElement;
    expect(wrapper?.style.transform).toContain("rotate(90deg)");
  });

  it("does not wrap in rotate span when rotate is 0", () => {
    render(
      <CanvasNodeIconSlot sizePx={24} rotate={0}>
        <span data-testid="child-0">icon</span>
      </CanvasNodeIconSlot>,
    );
    const child = screen.getByTestId("child-0");
    // Parent should be the outer slot span, not an inner rotate span
    expect(child.parentElement?.style.transform ?? "").not.toContain("rotate");
  });

  it("renders without rotate prop (no wrapper span)", () => {
    render(
      <CanvasNodeIconSlot sizePx={16}>
        <span data-testid="child-no-rotate">icon</span>
      </CanvasNodeIconSlot>,
    );
    expect(screen.getByTestId("child-no-rotate")).toBeInTheDocument();
  });

  it("applies rotate=180 correctly", () => {
    render(
      <CanvasNodeIconSlot sizePx={24} rotate={180}>
        <span data-testid="child-180">icon</span>
      </CanvasNodeIconSlot>,
    );
    const child = screen.getByTestId("child-180");
    expect(child.parentElement?.style.transform).toContain("rotate(180deg)");
  });

  it("applies rotate=270 correctly", () => {
    render(
      <CanvasNodeIconSlot sizePx={24} rotate={270}>
        <span data-testid="child-270">icon</span>
      </CanvasNodeIconSlot>,
    );
    const child = screen.getByTestId("child-270");
    expect(child.parentElement?.style.transform).toContain("rotate(270deg)");
  });
});
