/**
 * Unit tests for the field-mapping logic in analyzeWithAzure.
 * Exercises `mapAnalysisResult` directly with synthetic AnalysisResult values —
 * no Azure SDK network calls, no vi.mock.
 */
import { describe, expect, it } from "vitest";
import type { AnalysisResult } from "@azure/ai-content-understanding";
import { mapAnalysisResult } from "../src/lib/analyzeWithAzure";

// ---------------------------------------------------------------------------
// Helpers to build synthetic AnalysisResult shapes
// ---------------------------------------------------------------------------

function makeStringField(value: string | null) {
  return { type: "string", value } as const;
}

function makeNumberField(value: number | null) {
  return { type: "number", value } as const;
}

function makeIntegerField(value: number | null) {
  return { type: "integer", value } as const;
}

function makeBooleanField(value: boolean | null) {
  return { type: "boolean", value } as const;
}

function makeArrayField(items: unknown[]) {
  return { type: "array", value: items } as const;
}

function makeObjectField(properties: Record<string, unknown>) {
  return { type: "object", value: properties } as const;
}

function makeAnalysisResult(overrides: Partial<AnalysisResult> = {}): AnalysisResult {
  return { contents: [], ...overrides } as unknown as AnalysisResult;
}

// ---------------------------------------------------------------------------
// Empty / edge cases
// ---------------------------------------------------------------------------

describe("mapAnalysisResult — empty / edge cases", () => {
  it("returns empty content and fields when contents is empty", () => {
    const result = mapAnalysisResult(makeAnalysisResult({ contents: [] }));
    expect(result).toEqual({ content: "", fields: {} });
  });

  it("returns empty content and fields when contents is undefined", () => {
    const result = mapAnalysisResult(makeAnalysisResult({ contents: undefined }));
    expect(result).toEqual({ content: "", fields: {} });
  });

  it("returns markdown content from a single content item", () => {
    const result = mapAnalysisResult(
      makeAnalysisResult({
        contents: [{ markdown: "# Invoice\n\nTotal: $100", fields: {} }] as unknown as AnalysisResult["contents"],
      }),
    );
    expect(result.content).toBe("# Invoice\n\nTotal: $100");
    expect(result.fields).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Single content — field type mapping
// ---------------------------------------------------------------------------

describe("mapAnalysisResult — string field", () => {
  it("maps a string field value", () => {
    const result = mapAnalysisResult(
      makeAnalysisResult({
        contents: [
          {
            markdown: "",
            fields: { VendorName: makeStringField("Acme Corp") },
          },
        ] as unknown as AnalysisResult["contents"],
      }),
    );
    expect(result.fields).toHaveProperty("VendorName", "Acme Corp");
  });

  it("maps a null string field to null", () => {
    const result = mapAnalysisResult(
      makeAnalysisResult({
        contents: [
          { markdown: "", fields: { VendorName: makeStringField(null) } },
        ] as unknown as AnalysisResult["contents"],
      }),
    );
    expect(result.fields).toHaveProperty("VendorName", null);
  });
});

describe("mapAnalysisResult — number field", () => {
  it("maps a number field value", () => {
    const result = mapAnalysisResult(
      makeAnalysisResult({
        contents: [
          { markdown: "", fields: { InvoiceTotal: makeNumberField(1234.56) } },
        ] as unknown as AnalysisResult["contents"],
      }),
    );
    expect(result.fields).toHaveProperty("InvoiceTotal", 1234.56);
  });
});

describe("mapAnalysisResult — integer field", () => {
  it("maps an integer field value", () => {
    const result = mapAnalysisResult(
      makeAnalysisResult({
        contents: [
          { markdown: "", fields: { ItemCount: makeIntegerField(5) } },
        ] as unknown as AnalysisResult["contents"],
      }),
    );
    expect(result.fields).toHaveProperty("ItemCount", 5);
  });
});

describe("mapAnalysisResult — boolean field", () => {
  it("maps a boolean field value", () => {
    const result = mapAnalysisResult(
      makeAnalysisResult({
        contents: [
          { markdown: "", fields: { IsPaid: makeBooleanField(true) } },
        ] as unknown as AnalysisResult["contents"],
      }),
    );
    expect(result.fields).toHaveProperty("IsPaid", true);
  });
});

describe("mapAnalysisResult — array field", () => {
  it("maps an array field with string items", () => {
    const result = mapAnalysisResult(
      makeAnalysisResult({
        contents: [
          {
            markdown: "",
            fields: {
              Tags: makeArrayField([makeStringField("urgent"), makeStringField("new")]),
            },
          },
        ] as unknown as AnalysisResult["contents"],
      }),
    );
    expect(result.fields).toHaveProperty("Tags");
    expect(result.fields["Tags"]).toEqual(["urgent", "new"]);
  });
});

describe("mapAnalysisResult — object field", () => {
  it("maps a nested object field", () => {
    const result = mapAnalysisResult(
      makeAnalysisResult({
        contents: [
          {
            markdown: "",
            fields: {
              Vendor: makeObjectField({ Name: makeStringField("Acme"), Country: makeStringField("NL") }),
            },
          },
        ] as unknown as AnalysisResult["contents"],
      }),
    );
    expect(result.fields["Vendor"]).toEqual({ Name: "Acme", Country: "NL" });
  });
});

// ---------------------------------------------------------------------------
// Multi-segment (multiple content items)
// ---------------------------------------------------------------------------

describe("mapAnalysisResult — multi-segment", () => {
  it("returns a segments array when multiple content items are present", () => {
    const result = mapAnalysisResult(
      makeAnalysisResult({
        contents: [
          { markdown: "Page 1", fields: { Total: makeNumberField(100) } },
          { markdown: "Page 2", fields: { Total: makeNumberField(200) } },
        ] as unknown as AnalysisResult["contents"],
      }),
    );
    expect(result.content).toBe("Page 1\n\nPage 2");
    expect(Array.isArray((result.fields as { segments: unknown[] }).segments)).toBe(true);
    const segments = (result.fields as { segments: Array<{ index: number; markdown: string; fields: unknown }> })
      .segments;
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ index: 0, markdown: "Page 1" });
    expect(segments[1]).toMatchObject({ index: 1, markdown: "Page 2" });
  });
});
