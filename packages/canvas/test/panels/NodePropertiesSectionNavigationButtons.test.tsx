// @vitest-environment jsdom

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NodePropertiesSectionNavigationButtons } from "../../src/panels/NodePropertiesSectionNavigationButtons";

const NAV_WITH_BOTH = {
  prev: { invocationId: "inv-prev" },
  next: { invocationId: "inv-next" },
  currentIndex: 1,
  totalCount: 3,
};

const NAV_NO_PREV = {
  prev: null,
  next: { invocationId: "inv-next" },
  currentIndex: 0,
  totalCount: 2,
};

const NAV_NO_NEXT = {
  prev: { invocationId: "inv-prev" },
  next: null,
  currentIndex: 1,
  totalCount: 2,
};

describe("NodePropertiesSectionNavigationButtons.render", () => {
  it("renders prev and next buttons for section", () => {
    render(NodePropertiesSectionNavigationButtons.render({ sectionId: "output", navigation: NAV_WITH_BOTH }));
    expect(screen.getByTestId("node-properties-section-prev-output")).toBeInTheDocument();
    expect(screen.getByTestId("node-properties-section-next-output")).toBeInTheDocument();
  });

  it("disables prev button when navigation.prev is null", () => {
    render(NodePropertiesSectionNavigationButtons.render({ sectionId: "s1", navigation: NAV_NO_PREV }));
    expect(screen.getByTestId("node-properties-section-prev-s1")).toBeDisabled();
    expect(screen.getByTestId("node-properties-section-next-s1")).not.toBeDisabled();
  });

  it("disables next button when navigation.next is null", () => {
    render(NodePropertiesSectionNavigationButtons.render({ sectionId: "s2", navigation: NAV_NO_NEXT }));
    expect(screen.getByTestId("node-properties-section-next-s2")).toBeDisabled();
    expect(screen.getByTestId("node-properties-section-prev-s2")).not.toBeDisabled();
  });

  it("calls onSelectInvocation with prev.invocationId when prev is clicked", () => {
    const onSelectInvocation = vi.fn();
    render(
      NodePropertiesSectionNavigationButtons.render({
        sectionId: "s3",
        navigation: NAV_WITH_BOTH,
        onSelectInvocation,
      }),
    );
    fireEvent.click(screen.getByTestId("node-properties-section-prev-s3"));
    expect(onSelectInvocation).toHaveBeenCalledWith("inv-prev");
  });

  it("calls onSelectInvocation with next.invocationId when next is clicked", () => {
    const onSelectInvocation = vi.fn();
    render(
      NodePropertiesSectionNavigationButtons.render({
        sectionId: "s4",
        navigation: NAV_WITH_BOTH,
        onSelectInvocation,
      }),
    );
    fireEvent.click(screen.getByTestId("node-properties-section-next-s4"));
    expect(onSelectInvocation).toHaveBeenCalledWith("inv-next");
  });

  it("does not throw when onSelectInvocation is not provided and prev is clicked", () => {
    render(
      NodePropertiesSectionNavigationButtons.render({
        sectionId: "s5",
        navigation: NAV_WITH_BOTH,
      }),
    );
    // Should not throw even without handler
    expect(() => fireEvent.click(screen.getByTestId("node-properties-section-prev-s5"))).not.toThrow();
  });
});
