// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowCanvasNodeIcon } from "../../src/features/workflows/components/canvas/WorkflowCanvasNodeIcon";
import { WorkflowNodeIconResolver } from "../../src/features/workflows/components/workflowDetail/WorkflowDetailIcons";

function getRotationTransform(container: HTMLElement): string {
  const all = container.querySelectorAll<HTMLElement>("*");
  for (const el of all) {
    const t = el.style.transform;
    if (t && t.includes("rotate(")) {
      return t;
    }
  }
  return "";
}

describe("WorkflowCanvasNodeIcon", () => {
  describe("@rot=<deg> suffix parsing", () => {
    it("applies a 90° rotation for lucide:split@rot=90 (If node LTR orientation)", () => {
      const { container } = render(<WorkflowCanvasNodeIcon icon="lucide:split@rot=90" sizePx={16} />);
      expect(getRotationTransform(container)).toBe("rotate(90deg)");
    });

    it("applies a 90° rotation for lucide:merge@rot=90 (Merge node LTR orientation)", () => {
      const { container } = render(<WorkflowCanvasNodeIcon icon="lucide:merge@rot=90" sizePx={16} />);
      expect(getRotationTransform(container)).toBe("rotate(90deg)");
    });

    it("accepts 180 and 270 but rejects non-orthogonal angles", () => {
      const ok180 = render(<WorkflowCanvasNodeIcon icon="lucide:arrow-right@rot=180" sizePx={16} />);
      const ok270 = render(<WorkflowCanvasNodeIcon icon="lucide:arrow-right@rot=270" sizePx={16} />);
      const reject = render(<WorkflowCanvasNodeIcon icon="lucide:arrow-right@rot=45" sizePx={16} />);
      expect(getRotationTransform(ok180.container)).toBe("rotate(180deg)");
      expect(getRotationTransform(ok270.container)).toBe("rotate(270deg)");
      expect(getRotationTransform(reject.container)).toBe("");
    });

    it("does NOT apply a rotation to a plain icon without modifier", () => {
      const { container } = render(<WorkflowCanvasNodeIcon icon="lucide:merge" sizePx={16} />);
      expect(getRotationTransform(container)).toBe("");
    });

    it("keeps URLs containing '@' intact (basic-auth URL without a @rot suffix)", () => {
      const { container } = render(
        <WorkflowCanvasNodeIcon icon="https://user@host.example/icon.svg" sizePx={16} />,
      );
      const img = container.querySelector<HTMLImageElement>("img");
      expect(img?.getAttribute("src")).toBe("https://user@host.example/icon.svg");
      expect(getRotationTransform(container)).toBe("");
    });

    it("rotates a builtin:<id> icon when a @rot= suffix is appended", () => {
      const { container } = render(<WorkflowCanvasNodeIcon icon="builtin:split-rows@rot=90" sizePx={16} />);
      expect(getRotationTransform(container)).toBe("rotate(90deg)");
      const img = container.querySelector<HTMLImageElement>("img");
      expect(img?.getAttribute("src")).toBe("/canvas-icons/builtin/split-rows.svg");
    });

    it("resolves builtin:split-rows to the pixel-perfect asset (no rotation)", () => {
      const { container } = render(<WorkflowCanvasNodeIcon icon="builtin:split-rows" sizePx={16} />);
      const img = container.querySelector<HTMLImageElement>("img");
      expect(img?.getAttribute("src")).toBe("/canvas-icons/builtin/split-rows.svg");
      expect(getRotationTransform(container)).toBe("");
    });

    it("resolves builtin:aggregate-rows to the pixel-perfect asset (no rotation)", () => {
      const { container } = render(<WorkflowCanvasNodeIcon icon="builtin:aggregate-rows" sizePx={16} />);
      const img = container.querySelector<HTMLImageElement>("img");
      expect(img?.getAttribute("src")).toBe("/canvas-icons/builtin/aggregate-rows.svg");
      expect(getRotationTransform(container)).toBe("");
    });
  });
});

describe("WorkflowNodeIconResolver.resolveFallback (role-only)", () => {
  it("maps agent/nestedAgent roles to Bot", () => {
    expect(WorkflowNodeIconResolver.resolveFallback("agent").displayName).toBe("Bot");
    expect(WorkflowNodeIconResolver.resolveFallback("nestedAgent").displayName).toBe("Bot");
  });

  it("maps languageModel role to Brain", () => {
    expect(WorkflowNodeIconResolver.resolveFallback("languageModel").displayName).toBe("Brain");
  });

  it("maps tool role to Wrench", () => {
    expect(WorkflowNodeIconResolver.resolveFallback("tool").displayName).toBe("Wrench");
  });

  it("returns a generic Boxes icon for unknown or missing roles (no substring-based guesses)", () => {
    expect(WorkflowNodeIconResolver.resolveFallback().displayName).toBe("Boxes");
    expect(WorkflowNodeIconResolver.resolveFallback("").displayName).toBe("Boxes");
    // Pre-fix bug: `"wait".includes("ai")` silently returned Bot. Role-only fallback makes this impossible.
    expect(WorkflowNodeIconResolver.resolveFallback("wait").displayName).toBe("Boxes");
    expect(WorkflowNodeIconResolver.resolveFallback("filter").displayName).toBe("Boxes");
  });
});
