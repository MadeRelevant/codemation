/**
 * Tests for ExcelReadRangeNode (C3) and excelSerialToIso helper.
 *
 * fetch is stubbed by saving/restoring globalThis.fetch manually.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExcelReadRange, ExcelReadRangeNode, excelSerialToIso } from "../../src/excel/excelReadRangeNode";
import type { WorkbookHandle } from "../../src/excel/session";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(token = "tok") {
  return {
    accessToken: token,
    refresh: vi.fn().mockResolvedValue(token),
  };
}

function makeHandle(overrides: Partial<WorkbookHandle> = {}): WorkbookHandle {
  return {
    driveId: "driveA",
    itemId: "itemB",
    sessionId: "SESSION-123",
    expiresAt: 0,
    cookies: ["ARRAffinity=abc; Path=/"],
    persistChanges: true,
    ...overrides,
  };
}

function makeFetchResponse(opts: { status?: number; json?: unknown }): Response {
  const { status = 200, json } = opts;
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : String(status),
    headers: {
      get(name: string): string | null {
        if (name.toLowerCase() === "content-type") return "application/json";
        return null;
      },
      getSetCookie(): string[] {
        return [];
      },
    } as unknown as Headers,
    json: async () => json,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

function makeArgs(
  cfg: { handle: WorkbookHandle; sheet: string; range?: string; valuesOnly?: boolean; includeFormulas?: boolean },
  getCredentialImpl: () => Promise<unknown>,
) {
  const config = new ExcelReadRange("readRange", cfg);
  return {
    item: { json: {}, binary: {} },
    ctx: {
      config,
      getCredential: vi.fn().mockImplementation(getCredentialImpl),
      binary: {},
    },
  } as unknown as Parameters<ExcelReadRangeNode["execute"]>[0];
}

// ---------------------------------------------------------------------------
// excelSerialToIso helper tests
// ---------------------------------------------------------------------------

describe("excelSerialToIso", () => {
  it("serial 25569 → 1970-01-01 (Unix epoch)", () => {
    const result = excelSerialToIso(25569);
    expect(result).toBe("1970-01-01T00:00:00.000Z");
  });

  it("serial 44927 → 2023-01-01", () => {
    const result = excelSerialToIso(44927);
    expect(result).toBe("2023-01-01T00:00:00.000Z");
  });

  it("serial 0 → returns a date (1899-12-30)", () => {
    // Serial 0 is Excel's sentinel for 1900-01-00 (non-existent).
    // (0 - 25569) * 86400 * 1000 = negative = Dec 30, 1899 UTC
    const result = excelSerialToIso(0);
    expect(result).not.toBeNull();
  });

  it("returns null for NaN", () => {
    expect(excelSerialToIso(NaN)).toBeNull();
  });

  it("returns null for Infinity", () => {
    expect(excelSerialToIso(Infinity)).toBeNull();
  });

  it("returns null for -Infinity", () => {
    expect(excelSerialToIso(-Infinity)).toBeNull();
  });

  it("returns null for negative serials", () => {
    expect(excelSerialToIso(-1)).toBeNull();
    expect(excelSerialToIso(-100)).toBeNull();
  });

  it("returns a string for positive serials", () => {
    const result = excelSerialToIso(44562);
    expect(typeof result).toBe("string");
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});

// ---------------------------------------------------------------------------
// ExcelReadRangeNode tests
// ---------------------------------------------------------------------------

describe("ExcelReadRangeNode", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("usedRange + valuesOnly=true → correct URL with (valuesOnly=true)", async () => {
    let capturedUrl: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return makeFetchResponse({
        json: { address: "Sheet1!A1:B5", rowCount: 5, columnCount: 2, values: [[1, 2]] },
      });
    });

    const node = new ExcelReadRangeNode();
    const args = makeArgs({ handle: makeHandle(), sheet: "Sheet1", range: "usedRange", valuesOnly: true }, () =>
      Promise.resolve(makeSession()),
    );

    await node.execute(args);

    expect(capturedUrl).toContain("usedRange(valuesOnly=true)");
    expect(capturedUrl).toContain("/worksheets('Sheet1')/");
  });

  it("usedRange + valuesOnly=false → URL without valuesOnly suffix", async () => {
    let capturedUrl: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return makeFetchResponse({
        json: {
          address: "Sheet1!A1:B5",
          rowCount: 5,
          columnCount: 2,
          values: [[1, 2]],
          numberFormat: [["General", "General"]],
        },
      });
    });

    const node = new ExcelReadRangeNode();
    const args = makeArgs({ handle: makeHandle(), sheet: "Sheet1", range: "usedRange", valuesOnly: false }, () =>
      Promise.resolve(makeSession()),
    );

    await node.execute(args);

    // Should NOT contain "(valuesOnly=true)"
    expect(capturedUrl).toContain("/usedRange");
    expect(capturedUrl).not.toContain("valuesOnly=true");
  });

  it("includeFormulas=true with valuesOnly=true (default) promotes URL to non-valuesOnly", async () => {
    let capturedUrl: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return makeFetchResponse({
        json: {
          address: "Sheet1!A1:A3",
          rowCount: 3,
          columnCount: 1,
          values: [[10], [20], [30]],
          formulas: [["=B1"], ["=B2"], ["=B3"]],
        },
      });
    });

    const node = new ExcelReadRangeNode();
    // valuesOnly defaults to true, but includeFormulas=true should auto-promote
    const args = makeArgs({ handle: makeHandle(), sheet: "Sheet1", range: "usedRange", includeFormulas: true }, () =>
      Promise.resolve(makeSession()),
    );

    await node.execute(args);

    // URL must NOT use valuesOnly=true — formulas would be stripped
    expect(capturedUrl).toContain("/usedRange");
    expect(capturedUrl).not.toContain("valuesOnly=true");
  });

  it("explicit range A1:B10 → correct URL with range(address='A1:B10')", async () => {
    let capturedUrl: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return makeFetchResponse({
        json: { address: "Sheet1!A1:B10", rowCount: 10, columnCount: 2, values: [[]] },
      });
    });

    const node = new ExcelReadRangeNode();
    const args = makeArgs({ handle: makeHandle(), sheet: "Sheet1", range: "A1:B10" }, () =>
      Promise.resolve(makeSession()),
    );

    await node.execute(args);

    expect(capturedUrl).toContain("range(address='A1:B10')");
  });

  it("handle pass-through — same handle when no renewal", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({
        json: { address: "Sheet1!A1", rowCount: 1, columnCount: 1, values: [[42]] },
      }),
    );

    const handle = makeHandle({ sessionId: "SESS-EXACT" });
    const node = new ExcelReadRangeNode();
    const args = makeArgs({ handle, sheet: "Sheet1" }, () => Promise.resolve(makeSession()));

    const result = await node.execute(args);
    const output = (result as { json: WorkbookHandle }).json;

    expect(output.sessionId).toBe("SESS-EXACT");
  });

  it("date serial decoding — decodes date cells when valuesOnly=false and numberFormat present", async () => {
    // serial 25569 = 1970-01-01
    const rangeBody = {
      address: "Sheet1!A1:B2",
      rowCount: 2,
      columnCount: 2,
      values: [
        [25569, "hello"],
        [44927, 42],
      ],
      // A1 is a date, B1 is text, A2 is a date, B2 is a plain number
      numberFormat: [
        ["m/d/yyyy", "General"],
        ["dd-mmm-yyyy", "0.00"],
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse({ json: rangeBody }));

    const node = new ExcelReadRangeNode();
    const args = makeArgs({ handle: makeHandle(), sheet: "Sheet1", valuesOnly: false }, () =>
      Promise.resolve(makeSession()),
    );

    const result = await node.execute(args);
    const output = (result as { json: { values: unknown[][] } }).json;

    // A1: date serial 25569 → ISO string
    expect(output.values[0][0]).toBe("1970-01-01T00:00:00.000Z");
    // B1: string stays as-is
    expect(output.values[0][1]).toBe("hello");
    // A2: date serial 44927 → ISO string
    expect(output.values[1][0]).toBe("2023-01-01T00:00:00.000Z");
    // B2: plain number (not date format) stays as-is
    expect(output.values[1][1]).toBe(42);
  });

  it("no date decoding when valuesOnly=true (no numberFormat available)", async () => {
    const rangeBody = {
      address: "Sheet1!A1",
      rowCount: 1,
      columnCount: 1,
      values: [[25569]],
      // Even if numberFormat were somehow present, valuesOnly=true should skip decoding
    };

    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse({ json: rangeBody }));

    const node = new ExcelReadRangeNode();
    const args = makeArgs({ handle: makeHandle(), sheet: "Sheet1", valuesOnly: true }, () =>
      Promise.resolve(makeSession()),
    );

    const result = await node.execute(args);
    const output = (result as { json: { values: unknown[][] } }).json;

    // No decoding when valuesOnly=true
    expect(output.values[0][0]).toBe(25569);
  });

  it("formulas are included in output when includeFormulas=true", async () => {
    const rangeBody = {
      address: "Sheet1!A1:A3",
      rowCount: 3,
      columnCount: 1,
      values: [[10], [20], [30]],
      formulas: [["=A1*2"], ["=A2*2"], ["=A3*2"]],
    };

    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse({ json: rangeBody }));

    const node = new ExcelReadRangeNode();
    const args = makeArgs({ handle: makeHandle(), sheet: "Sheet1", includeFormulas: true }, () =>
      Promise.resolve(makeSession()),
    );

    const result = await node.execute(args);
    const output = (result as { json: { formulas?: unknown[][] } }).json;

    expect(output.formulas).toEqual([["=A1*2"], ["=A2*2"], ["=A3*2"]]);
  });

  it("output shape is correct (address, rowCount, columnCount)", async () => {
    const rangeBody = {
      address: "Sheet1!A1:C3",
      rowCount: 3,
      columnCount: 3,
      values: [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse({ json: rangeBody }));

    const node = new ExcelReadRangeNode();
    const args = makeArgs({ handle: makeHandle(), sheet: "Sheet1" }, () => Promise.resolve(makeSession()));

    const result = await node.execute(args);
    const output = (result as { json: { address: string; rowCount: number; columnCount: number } }).json;

    expect(output.address).toBe("Sheet1!A1:C3");
    expect(output.rowCount).toBe(3);
    expect(output.columnCount).toBe(3);
  });
});
