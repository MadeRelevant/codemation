/**
 * Tests for ExcelStyleRangeNode (C6).
 *
 * fetch is stubbed by saving/restoring globalThis.fetch manually.
 * ESLint forbids vi.mock/vi.stubGlobal/vi.stubEnv — we save/restore manually.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExcelStyleRange, ExcelStyleRangeNode } from "../../src/excel/excelStyleRangeNode";
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
        if (json !== undefined && name.toLowerCase() === "content-type") {
          return "application/json";
        }
        // Return null for 204-style responses
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

function makeArgs(cfg: ExcelStyleRange["cfg"], getCredentialImpl: () => Promise<unknown>) {
  const config = new ExcelStyleRange("style", cfg);
  return {
    item: { json: {}, binary: {} },
    ctx: {
      config,
      getCredential: vi.fn().mockImplementation(getCredentialImpl),
      binary: {},
    },
  } as unknown as Parameters<ExcelStyleRangeNode["execute"]>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExcelStyleRangeNode", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // Coalesced PATCH: font + fill + alignment + numberFormat
  // -------------------------------------------------------------------------

  it("PATCHes font, fill, and format separately — Graph rejects nested font/fill on /format", async () => {
    const capturedRequests: Array<{ url: string; method: string; body: unknown }> = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedRequests.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });
      return makeFetchResponse({ json: {} });
    });

    const node = new ExcelStyleRangeNode();
    const args = makeArgs(
      {
        handle: makeHandle(),
        sheet: "Sheet1",
        range: "A1:C3",
        font: { bold: true, color: "#FF0000" },
        fill: { color: "#FFFFFF" },
        alignment: { horizontal: "Center", wrapText: true },
        numberFormat: "0.00",
      },
      () => Promise.resolve(makeSession()),
    );

    const result = await node.execute(args);
    const output = (result as { json: { appliedFormatProps: string[] } }).json;

    // Three PATCHes: top-level /format (alignment + numberFormat), /format/font, /format/fill.
    expect(capturedRequests).toHaveLength(3);
    expect(capturedRequests.every((r) => r.method === "PATCH")).toBe(true);

    const formatReq = capturedRequests.find((r) => r.url.endsWith("/format"));
    const fontReq = capturedRequests.find((r) => r.url.endsWith("/format/font"));
    const fillReq = capturedRequests.find((r) => r.url.endsWith("/format/fill"));
    expect(formatReq).toBeDefined();
    expect(fontReq).toBeDefined();
    expect(fillReq).toBeDefined();

    const formatBody = formatReq!.body as Record<string, unknown>;
    expect(formatBody["horizontalAlignment"]).toBe("Center");
    expect(formatBody["wrapText"]).toBe(true);
    expect(formatBody["numberFormat"]).toBe("0.00");
    expect(formatBody["font"]).toBeUndefined();
    expect(formatBody["fill"]).toBeUndefined();

    expect(fontReq!.body).toEqual({ bold: true, color: "#FF0000" });
    expect(fillReq!.body).toEqual({ color: "#FFFFFF" });

    expect(output.appliedFormatProps).toContain("font");
    expect(output.appliedFormatProps).toContain("fill");
    expect(output.appliedFormatProps).toContain("alignment");
    expect(output.appliedFormatProps).toContain("numberFormat");
  });

  // -------------------------------------------------------------------------
  // Borders: per-edge PATCHes via Promise.all
  // -------------------------------------------------------------------------

  it("issues per-edge PATCH requests for borders (not coalesced in format PATCH)", async () => {
    const capturedRequests: Array<{ url: string; method: string; body: unknown }> = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedRequests.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });
      return makeFetchResponse({ json: {} });
    });

    const node = new ExcelStyleRangeNode();
    const args = makeArgs(
      {
        handle: makeHandle(),
        sheet: "Sheet1",
        range: "A1:B2",
        borders: {
          EdgeTop: { style: "Continuous", color: "#000000", weight: "Thin" },
          EdgeBottom: { style: "Continuous", color: "#000000", weight: "Thin" },
        },
      },
      () => Promise.resolve(makeSession()),
    );

    const result = await node.execute(args);
    const output = (result as { json: { appliedFormatProps: string[] } }).json;

    // No format PATCH (no font/fill/alignment/numberFormat), but 2 border PATCHes
    const borderRequests = capturedRequests.filter((r) => r.url.includes("/borders/"));
    expect(borderRequests).toHaveLength(2);

    const edgeTopReq = borderRequests.find((r) => r.url.includes("EdgeTop"));
    expect(edgeTopReq).toBeDefined();
    expect(edgeTopReq!.method).toBe("PATCH");
    expect(edgeTopReq!.body).toEqual({ style: "Continuous", color: "#000000", weight: "Thin" });

    const edgeBottomReq = borderRequests.find((r) => r.url.includes("EdgeBottom"));
    expect(edgeBottomReq).toBeDefined();

    expect(output.appliedFormatProps).toContain("borders");
  });

  it("borders use correct URL path with /format/borders/{edge}", async () => {
    const capturedUrls: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrls.push(url);
      return makeFetchResponse({ json: {} });
    });

    const node = new ExcelStyleRangeNode();
    const args = makeArgs(
      {
        handle: makeHandle(),
        sheet: "Sheet1",
        range: "D4:F6",
        borders: {
          EdgeLeft: { style: "Dash" },
          InsideVertical: { style: "Dot" },
        },
      },
      () => Promise.resolve(makeSession()),
    );

    await node.execute(args);

    const borderUrls = capturedUrls.filter((u) => u.includes("/borders/"));
    expect(borderUrls).toHaveLength(2);
    expect(borderUrls.some((u) => u.includes("/borders/EdgeLeft"))).toBe(true);
    expect(borderUrls.some((u) => u.includes("/borders/InsideVertical"))).toBe(true);
    // Border path must go through /format/borders/
    expect(borderUrls[0]).toContain("range(address='D4:F6')/format/borders/");
  });

  // -------------------------------------------------------------------------
  // Merge: separate POST
  // -------------------------------------------------------------------------

  it("merge=true — issues a separate POST to /range/merge after format PATCH", async () => {
    const capturedRequests: Array<{ url: string; method: string; body: unknown }> = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedRequests.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });
      return makeFetchResponse({ json: {} });
    });

    const node = new ExcelStyleRangeNode();
    const args = makeArgs(
      {
        handle: makeHandle(),
        sheet: "Sheet1",
        range: "A1:C1",
        font: { bold: true },
        merge: true,
      },
      () => Promise.resolve(makeSession()),
    );

    const result = await node.execute(args);
    const output = (result as { json: { mergedApplied: boolean } }).json;

    const mergeReqs = capturedRequests.filter((r) => r.url.includes("/merge"));
    expect(mergeReqs).toHaveLength(1);
    expect(mergeReqs[0].method).toBe("POST");
    expect(mergeReqs[0].body).toEqual({ across: false });
    expect(mergeReqs[0].url).toContain("range(address='A1:C1')/merge");

    expect(output.mergedApplied).toBe(true);
  });

  it("merge=false — no merge POST issued", async () => {
    const capturedUrls: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrls.push(url);
      return makeFetchResponse({ json: {} });
    });

    const node = new ExcelStyleRangeNode();
    const args = makeArgs(
      {
        handle: makeHandle(),
        sheet: "Sheet1",
        range: "A1:B2",
        font: { bold: true },
        merge: false,
      },
      () => Promise.resolve(makeSession()),
    );

    const result = await node.execute(args);
    const output = (result as { json: { mergedApplied: boolean } }).json;

    expect(capturedUrls.some((u) => u.includes("/merge"))).toBe(false);
    expect(output.mergedApplied).toBe(false);
  });

  // -------------------------------------------------------------------------
  // autofitColumns: separate POST
  // -------------------------------------------------------------------------

  it("autofitColumns=true — issues POST to /format/autofitColumns", async () => {
    const capturedRequests: Array<{ url: string; method: string }> = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedRequests.push({ url, method: init.method ?? "GET" });
      return makeFetchResponse({ json: {} });
    });

    const node = new ExcelStyleRangeNode();
    const args = makeArgs(
      {
        handle: makeHandle(),
        sheet: "Sheet1",
        range: "A1:D10",
        autofitColumns: true,
      },
      () => Promise.resolve(makeSession()),
    );

    const result = await node.execute(args);
    const output = (result as { json: { autofitApplied: boolean } }).json;

    const autofitReqs = capturedRequests.filter((r) => r.url.includes("autofitColumns"));
    expect(autofitReqs).toHaveLength(1);
    expect(autofitReqs[0].method).toBe("POST");
    expect(autofitReqs[0].url).toContain("range(address='A1:D10')/format/autofitColumns");

    expect(output.autofitApplied).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Combined: all properties at once
  // -------------------------------------------------------------------------

  it("all properties together — coalesced PATCH + per-edge borders + merge + autofit", async () => {
    const capturedRequests: Array<{ url: string; method: string }> = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedRequests.push({ url, method: init.method ?? "GET" });
      return makeFetchResponse({ json: {} });
    });

    const node = new ExcelStyleRangeNode();
    const args = makeArgs(
      {
        handle: makeHandle(),
        sheet: "Data",
        range: "B2:D4",
        font: { bold: true, size: 12 },
        fill: { color: "#EEEEEE" },
        alignment: { horizontal: "Left" },
        numberFormat: "#,##0",
        borders: {
          EdgeTop: { style: "Continuous", weight: "Thin" },
          EdgeBottom: { style: "Continuous", weight: "Thin" },
          EdgeLeft: { style: "Continuous", weight: "Thin" },
          EdgeRight: { style: "Continuous", weight: "Thin" },
        },
        merge: true,
        autofitColumns: true,
      },
      () => Promise.resolve(makeSession()),
    );

    const result = await node.execute(args);
    const output = (
      result as {
        json: {
          appliedFormatProps: string[];
          mergedApplied: boolean;
          autofitApplied: boolean;
        };
      }
    ).json;

    // 3 format-family PATCHes: top-level /format (alignment+numberFormat), /format/font, /format/fill.
    const formatPatch = capturedRequests.filter(
      (r) => r.method === "PATCH" && r.url.includes("/format") && !r.url.includes("/borders/"),
    );
    expect(formatPatch).toHaveLength(3);
    expect(formatPatch.some((r) => r.url.endsWith("/format/font"))).toBe(true);
    expect(formatPatch.some((r) => r.url.endsWith("/format/fill"))).toBe(true);

    // 4 border PATCHes
    const borderPatch = capturedRequests.filter((r) => r.url.includes("/borders/"));
    expect(borderPatch).toHaveLength(4);

    // 1 merge POST
    const mergePatch = capturedRequests.filter((r) => r.url.includes("/merge"));
    expect(mergePatch).toHaveLength(1);

    // 1 autofit POST
    const autofitPatch = capturedRequests.filter((r) => r.url.includes("autofitColumns"));
    expect(autofitPatch).toHaveLength(1);

    expect(output.appliedFormatProps).toContain("font");
    expect(output.appliedFormatProps).toContain("fill");
    expect(output.appliedFormatProps).toContain("alignment");
    expect(output.appliedFormatProps).toContain("numberFormat");
    expect(output.appliedFormatProps).toContain("borders");
    expect(output.mergedApplied).toBe(true);
    expect(output.autofitApplied).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Output: handle pass-through
  // -------------------------------------------------------------------------

  it("handle pass-through — same handle when no renewal", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse({ json: {} }));

    const handle = makeHandle({ sessionId: "STYLE-SESS" });
    const node = new ExcelStyleRangeNode();
    const args = makeArgs({ handle, sheet: "Sheet1", range: "A1", font: { bold: true } }, () =>
      Promise.resolve(makeSession()),
    );

    const result = await node.execute(args);
    const output = (result as { json: WorkbookHandle }).json;

    expect(output.sessionId).toBe("STYLE-SESS");
  });

  // -------------------------------------------------------------------------
  // Regression #6: font-only run goes to /format/font, NOT coalesced into /format
  // (guards against future refactors coalescing font/fill back into the top-level body)
  // -------------------------------------------------------------------------

  it("font-only: issues PATCH to /format/font, not /format; fill PATCH not issued", async () => {
    const capturedRequests: Array<{ url: string; body: unknown }> = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedRequests.push({
        url,
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });
      return makeFetchResponse({ json: {} });
    });

    const node = new ExcelStyleRangeNode();
    const args = makeArgs(
      {
        handle: makeHandle(),
        sheet: "Sheet1",
        range: "B2:D4",
        // font only — no fill, alignment, numberFormat, borders
        font: { bold: true, color: "#FF0000" },
      },
      () => Promise.resolve(makeSession()),
    );

    await node.execute(args);

    const fontReq = capturedRequests.find((r) => r.url.endsWith("/format/font"));
    const fillReq = capturedRequests.find((r) => r.url.endsWith("/format/fill"));
    // Top-level /format PATCH may be skipped (nothing in alignment/numberFormat to send)
    const topFormatReq = capturedRequests.find((r) => r.url.endsWith("/format"));

    // /format/font MUST have been PATCHed with the right body
    expect(fontReq).toBeDefined();
    expect(fontReq!.body).toEqual({ bold: true, color: "#FF0000" });

    // /format/fill must NOT have been called (no fill given)
    expect(fillReq).toBeUndefined();

    // If a top-level /format PATCH was issued it must NOT carry a 'font' key —
    // font belongs to the sub-resource only, never the top-level body
    if (topFormatReq) {
      expect((topFormatReq.body as Record<string, unknown>)["font"]).toBeUndefined();
    }
  });

  it("fill-only: issues PATCH to /format/fill, not /format; font PATCH not issued", async () => {
    const capturedRequests: Array<{ url: string }> = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedRequests.push({ url });
      return makeFetchResponse({ json: {} });
    });

    const node = new ExcelStyleRangeNode();
    const args = makeArgs(
      {
        handle: makeHandle(),
        sheet: "Sheet1",
        range: "A1:C3",
        // fill only
        fill: { color: "#EEEEEE" },
      },
      () => Promise.resolve(makeSession()),
    );

    await node.execute(args);

    const hasFillPatch = capturedRequests.some((r) => r.url.endsWith("/format/fill"));
    const hasFontPatch = capturedRequests.some((r) => r.url.endsWith("/format/font"));

    expect(hasFillPatch).toBe(true);
    expect(hasFontPatch).toBe(false);
  });

  it("no requests issued when no style properties provided", async () => {
    const capturedRequests: Array<{ url: string }> = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedRequests.push({ url });
      return makeFetchResponse({ json: {} });
    });

    const node = new ExcelStyleRangeNode();
    const args = makeArgs({ handle: makeHandle(), sheet: "Sheet1", range: "A1" }, () => Promise.resolve(makeSession()));

    const result = await node.execute(args);
    const output = (result as { json: { appliedFormatProps: string[] } }).json;

    // No style properties → no requests
    expect(capturedRequests).toHaveLength(0);
    expect(output.appliedFormatProps).toHaveLength(0);
  });
});
