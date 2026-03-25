import { describe, expect, it } from "vitest";

import {
  BUILTIN_CANVAS_ICON_URLS,
  WorkflowCanvasBuiltinIconRegistry,
} from "../src/features/workflows/components/canvas/lib/WorkflowCanvasBuiltinIconRegistry";

describe("WorkflowCanvasBuiltinIconRegistry", () => {
  it("resolves openai to a public canvas icon URL", () => {
    expect(WorkflowCanvasBuiltinIconRegistry.resolveUrl("openai")).toBe("/canvas-icons/builtin/openai.svg");
    expect(WorkflowCanvasBuiltinIconRegistry.resolveUrl("OPENAI")).toBe("/canvas-icons/builtin/openai.svg");
    expect(WorkflowCanvasBuiltinIconRegistry.has("openai")).toBe(true);
  });

  it("returns undefined for unknown ids", () => {
    expect(WorkflowCanvasBuiltinIconRegistry.resolveUrl("unknown-brand")).toBeUndefined();
    expect(WorkflowCanvasBuiltinIconRegistry.has("unknown-brand")).toBe(false);
  });

  it("exposes a stable URL map for registration review", () => {
    expect(BUILTIN_CANVAS_ICON_URLS.openai).toContain("openai.svg");
  });
});
