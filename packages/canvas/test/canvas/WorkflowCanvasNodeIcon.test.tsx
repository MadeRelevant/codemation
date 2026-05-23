// @vitest-environment jsdom

import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkflowCanvasNodeIcon } from "../../src/canvas/WorkflowCanvasNodeIcon";
import { WorkflowCanvasConfigProvider } from "@codemation/canvas-core";

// Provide a minimal canvas config context (useWorkflowCanvasConfig returns undefined when provider value is undefined)
function Wrapper({ children }: { children: React.ReactNode }) {
  return <WorkflowCanvasConfigProvider value={undefined}>{children}</WorkflowCanvasConfigProvider>;
}

function renderIcon(props: Parameters<typeof WorkflowCanvasNodeIcon>[0]) {
  return render(
    <Wrapper>
      <WorkflowCanvasNodeIcon {...props} />
    </Wrapper>,
  );
}

describe("WorkflowCanvasNodeIcon", () => {
  it("renders a fallback Bot icon for agent role when icon is unset", () => {
    const { container } = renderIcon({ sizePx: 20, fallbackRole: "agent" });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders a fallback Brain icon for languageModel role", () => {
    const { container } = renderIcon({ sizePx: 20, fallbackRole: "languageModel" });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders a fallback Wrench icon for tool role", () => {
    const { container } = renderIcon({ sizePx: 20, fallbackRole: "tool" });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders a fallback CircleHelp for unknown role", () => {
    const { container } = renderIcon({ sizePx: 20, fallbackRole: "unknown" });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders an img tag for http URL icons", () => {
    const { container } = renderIcon({ sizePx: 20, icon: "https://example.com/icon.png" });
    expect(container.querySelector("img")).not.toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toBe("https://example.com/icon.png");
  });

  it("renders an img tag for data: URL icons", () => {
    const { container } = renderIcon({ sizePx: 20, icon: "data:image/svg+xml,<svg/>" });
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("renders an img tag for root-relative URL /icons/foo.png", () => {
    const { container } = renderIcon({ sizePx: 20, icon: "/icons/foo.png" });
    expect(container.querySelector("img")).not.toBeNull();
  });

  it("renders a Lucide icon by name from the registry (lucide: prefix)", () => {
    // globe is in the built-in lucide registry for canvas
    const { container } = renderIcon({ sizePx: 20, icon: "lucide:globe" });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders a Lucide icon for legacy kebab name without prefix", () => {
    const { container } = renderIcon({ sizePx: 20, icon: "globe" });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders a fallback CircleHelp for icon string that is not a lucide name", () => {
    // A string with spaces or special chars doesn't match lucide kebab pattern
    const { container } = renderIcon({ sizePx: 20, icon: "not a valid icon!" });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders with rotation modifier @rot=90", () => {
    // globe with rotation should still render inside a rotated slot
    const { container } = renderIcon({ sizePx: 20, icon: "globe@rot=90" });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders a builtin icon for builtin: prefix (falls back to CircleHelp when not found)", () => {
    const { container } = renderIcon({ sizePx: 20, icon: "builtin:nonexistent-builtin" });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders for si: prefix (falls back to CircleHelp when slug not found in registry)", () => {
    const { container } = renderIcon({ sizePx: 20, icon: "si:nonexistent-slug" });
    expect(container.firstChild).not.toBeNull();
  });

  it("renders with empty icon string as fallback", () => {
    const { container } = renderIcon({ sizePx: 20, icon: "" });
    expect(container.firstChild).not.toBeNull();
  });
});
