/**
 * Unit tests for inspectorSummary on OCR node configs.
 * No engine / DI setup required — just construct the config and call the method.
 */
import { describe, expect, it } from "vitest";
import { analyzeInvoiceNode } from "../src/nodes/analyzeInvoiceNode";
import { analyzeDocumentNode } from "../src/nodes/analyzeDocumentNode";
import { analyzeImageNode } from "../src/nodes/analyzeImageNode";

// Helper: creates a node config with partial input, bypassing the strict DefinedNodeConfigInput type.
function summary(
  node: { create(cfg: Record<string, unknown>, name?: string): { inspectorSummary?(): unknown } },
  cfg: Record<string, unknown>,
) {
  const config = node.create(cfg as never, "test");
  return config.inspectorSummary?.();
}

// ---------------------------------------------------------------------------
// Analyze Invoice
// ---------------------------------------------------------------------------

describe("analyzeInvoiceNode inspectorSummary", () => {
  it("shows Invoice (prebuilt) as analyzer label with defaults", () => {
    const rows = summary(analyzeInvoiceNode, { binaryField: "data" });
    expect(rows).toContainEqual({ label: "Analyzer", value: "Invoice (prebuilt)" });
  });

  it("does not show binary field row when using default 'data'", () => {
    const rows = summary(analyzeInvoiceNode, { binaryField: "data" }) as Array<{ label: string }>;
    expect(rows.map((r) => r.label)).not.toContain("Binary field");
  });

  it("shows binary field row when non-default field is set", () => {
    const rows = summary(analyzeInvoiceNode, { binaryField: "attachment" });
    expect(rows).toContainEqual({ label: "Binary field", value: "attachment" });
  });

  it("shows content type row when set", () => {
    const rows = summary(analyzeInvoiceNode, { contentType: "application/pdf" });
    expect(rows).toContainEqual({ label: "Content type", value: "application/pdf" });
  });

  it("does not show content type row when not set", () => {
    const rows = summary(analyzeInvoiceNode, {}) as Array<{ label: string }>;
    expect(rows.map((r) => r.label)).not.toContain("Content type");
  });
});

// ---------------------------------------------------------------------------
// Analyze Document
// ---------------------------------------------------------------------------

describe("analyzeDocumentNode inspectorSummary", () => {
  it("shows default analyzer ID when not overridden", () => {
    const rows = summary(analyzeDocumentNode, {});
    expect(rows).toContainEqual({ label: "Analyzer", value: "prebuilt-document" });
  });

  it("shows custom analyzer ID when set", () => {
    const rows = summary(analyzeDocumentNode, { analyzerId: "my-custom-analyzer" });
    expect(rows).toContainEqual({ label: "Analyzer", value: "my-custom-analyzer" });
  });

  it("shows binary field row when non-default field is set", () => {
    const rows = summary(analyzeDocumentNode, { binaryField: "doc" });
    expect(rows).toContainEqual({ label: "Binary field", value: "doc" });
  });
});

// ---------------------------------------------------------------------------
// Analyze Image
// ---------------------------------------------------------------------------

describe("analyzeImageNode inspectorSummary", () => {
  it("shows default analyzer ID when not overridden", () => {
    const rows = summary(analyzeImageNode, {});
    expect(rows).toContainEqual({ label: "Analyzer", value: "prebuilt-imageAnalyzer" });
  });

  it("shows custom analyzer ID when overridden", () => {
    const rows = summary(analyzeImageNode, { analyzerId: "my-image-model" });
    expect(rows).toContainEqual({ label: "Analyzer", value: "my-image-model" });
  });

  it("shows binary field when non-default", () => {
    const rows = summary(analyzeImageNode, { binaryField: "photo" });
    expect(rows).toContainEqual({ label: "Binary field", value: "photo" });
  });
});
