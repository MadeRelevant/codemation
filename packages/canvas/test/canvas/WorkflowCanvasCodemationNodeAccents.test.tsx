// @vitest-environment jsdom

import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowCanvasCodemationNodeAccents } from "../../src/canvas/WorkflowCanvasCodemationNodeAccents";

const BASE_PROPS = {
  isActive: false,
  isRunning: false,
  activityColor: "#2563eb",
  activityRingStyle: { position: "absolute" as const },
  isPropertiesTarget: false,
  isActiveForProperties: false,
  isSelected: false,
  isActiveForSelected: false,
};

describe("WorkflowCanvasCodemationNodeAccents", () => {
  it("renders no accent elements when all flags are false", () => {
    const { container } = render(<WorkflowCanvasCodemationNodeAccents {...BASE_PROPS} />);
    // The fragment renders only empty children (no divs)
    expect(container.querySelectorAll("div").length).toBe(0);
  });

  it("renders the activity ring when isActive is true", () => {
    const { container } = render(<WorkflowCanvasCodemationNodeAccents {...BASE_PROPS} isActive isRunning={false} />);
    // isActive renders 2 divs: the glow and the ring
    expect(container.querySelectorAll("div").length).toBe(2);
  });

  it("renders the properties-target border when isPropertiesTarget is true", () => {
    const { container } = render(<WorkflowCanvasCodemationNodeAccents {...BASE_PROPS} isPropertiesTarget />);
    expect(container.querySelectorAll("div").length).toBe(1);
  });

  it("renders the selected dashed border when isSelected is true", () => {
    const { container } = render(<WorkflowCanvasCodemationNodeAccents {...BASE_PROPS} isSelected />);
    expect(container.querySelectorAll("div").length).toBe(1);
  });

  it("renders all three accent groups simultaneously", () => {
    const { container } = render(
      <WorkflowCanvasCodemationNodeAccents {...BASE_PROPS} isActive isPropertiesTarget isSelected />,
    );
    // 2 for active + 1 for propertiesTarget + 1 for selected
    expect(container.querySelectorAll("div").length).toBe(4);
  });

  it("adjusts glow opacity to 0.85 when isRunning is true", () => {
    const { container } = render(<WorkflowCanvasCodemationNodeAccents {...BASE_PROPS} isActive isRunning />);
    const glowDiv = container.querySelector("div") as HTMLElement;
    expect(glowDiv.style.opacity).toBe("0.85");
  });

  it("adjusts glow opacity to 0.48 when isRunning is false", () => {
    const { container } = render(<WorkflowCanvasCodemationNodeAccents {...BASE_PROPS} isActive isRunning={false} />);
    const glowDiv = container.querySelector("div") as HTMLElement;
    expect(glowDiv.style.opacity).toBe("0.48");
  });
});
