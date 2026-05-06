/**
 * Tests for ExcelStyleRangeNode (C6).
 *
 * fetch is stubbed by saving/restoring globalThis.fetch manually.
 * ESLint forbids vi.mock/vi.stubGlobal/vi.stubEnv — we save/restore manually.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeExcelStyleRange } from "../../src/excel/excelStyleRangeNode";
import type { ExcelStyleRangeOptions } from "../../src/excel/excelStyleRangeNode";
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executeExcelStyleRange", () => {
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

    const cfg: ExcelStyleRangeOptions = {
      handle: makeHandle(),
      sheet: "Sheet1",
      range: "A1:C3",
      font: { bold: true, color: "#FF0000" },
      fill: { color: "#FFFFFF" },
      alignment: { horizontal: "Center", wrapText: true },
      numberFormat: "0.00",
    };

    const result = await executeExcelStyleRange(makeSession() as never, cfg, {});

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

    expect(result.appliedFormatProps).toContain("font");
    expect(result.appliedFormatProps).toContain("fill");
    expect(result.appliedFormatProps).toContain("alignment");
    expect(result.appliedFormatProps).toContain("numberFormat");
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

    const cfg: ExcelStyleRangeOptions = {
      handle: makeHandle(),
      sheet: "Sheet1",
      range: "A1:B2",
      borders: {
        EdgeTop: { style: "Continuous", color: "#000000", weight: "Thin" },
        EdgeBottom: { style: "Continuous", color: "#000000", weight: "Thin" },
      },
    };

    const result = await executeExcelStyleRange(makeSession() as never, cfg, {});

    const borderRequests = capturedRequests.filter((r) => r.url.includes("/borders/"));
    expect(borderRequests).toHaveLength(2);

    const edgeTopReq = borderRequests.find((r) => r.url.includes("EdgeTop"));
    expect(edgeTopReq).toBeDefined();
    expect(edgeTopReq!.method).toBe("PATCH");
    expect(edgeTopReq!.body).toEqual({ style: "Continuous", color: "#000000", weight: "Thin" });

    const edgeBottomReq = borderRequests.find((r) => r.url.includes("EdgeBottom"));
    expect(edgeBottomReq).toBeDefined();

    expect(result.appliedFormatProps).toContain("borders");
  });

  it("borders use correct URL path with /format/borders/{edge}", async () => {
    const capturedUrls: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrls.push(url);
      return makeFetchResponse({ json: {} });
    });

    const cfg: ExcelStyleRangeOptions = {
      handle: makeHandle(),
      sheet: "Sheet1",
      range: "D4:F6",
      borders: {
        EdgeLeft: { style: "Dash" },
        InsideVertical: { style: "Dot" },
      },
    };

    await executeExcelStyleRange(makeSession() as never, cfg, {});

    const borderUrls = capturedUrls.filter((u) => u.includes("/borders/"));
    expect(borderUrls).toHaveLength(2);
    expect(borderUrls.some((u) => u.includes("/borders/EdgeLeft"))).toBe(true);
    expect(borderUrls.some((u) => u.includes("/borders/InsideVertical"))).toBe(true);
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

    const cfg: ExcelStyleRangeOptions = {
      handle: makeHandle(),
      sheet: "Sheet1",
      range: "A1:C1",
      font: { bold: true },
      merge: true,
    };

    const result = await executeExcelStyleRange(makeSession() as never, cfg, {});

    const mergeReqs = capturedRequests.filter((r) => r.url.includes("/merge"));
    expect(mergeReqs).toHaveLength(1);
    expect(mergeReqs[0]!.method).toBe("POST");
    expect(mergeReqs[0]!.body).toEqual({ across: false });
    expect(mergeReqs[0]!.url).toContain("range(address='A1:C1')/merge");

    expect(result.mergedApplied).toBe(true);
  });

  it("merge=false — no merge POST issued", async () => {
    const capturedUrls: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrls.push(url);
      return makeFetchResponse({ json: {} });
    });

    const cfg: ExcelStyleRangeOptions = {
      handle: makeHandle(),
      sheet: "Sheet1",
      range: "A1:B2",
      font: { bold: true },
      merge: false,
    };

    const result = await executeExcelStyleRange(makeSession() as never, cfg, {});

    expect(capturedUrls.some((u) => u.includes("/merge"))).toBe(false);
    expect(result.mergedApplied).toBe(false);
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

    const cfg: ExcelStyleRangeOptions = {
      handle: makeHandle(),
      sheet: "Sheet1",
      range: "A1:D10",
      autofitColumns: true,
    };

    const result = await executeExcelStyleRange(makeSession() as never, cfg, {});

    const autofitReqs = capturedRequests.filter((r) => r.url.includes("autofitColumns"));
    expect(autofitReqs).toHaveLength(1);
    expect(autofitReqs[0]!.method).toBe("POST");
    expect(autofitReqs[0]!.url).toContain("range(address='A1:D10')/format/autofitColumns");

    expect(result.autofitApplied).toBe(true);
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

    const cfg: ExcelStyleRangeOptions = {
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
    };

    const result = await executeExcelStyleRange(makeSession() as never, cfg, {});

    const formatPatch = capturedRequests.filter(
      (r) => r.method === "PATCH" && r.url.includes("/format") && !r.url.includes("/borders/"),
    );
    expect(formatPatch).toHaveLength(3);
    expect(formatPatch.some((r) => r.url.endsWith("/format/font"))).toBe(true);
    expect(formatPatch.some((r) => r.url.endsWith("/format/fill"))).toBe(true);

    const borderPatch = capturedRequests.filter((r) => r.url.includes("/borders/"));
    expect(borderPatch).toHaveLength(4);

    const mergePatch = capturedRequests.filter((r) => r.url.includes("/merge"));
    expect(mergePatch).toHaveLength(1);

    const autofitPatch = capturedRequests.filter((r) => r.url.includes("autofitColumns"));
    expect(autofitPatch).toHaveLength(1);

    expect(result.appliedFormatProps).toContain("font");
    expect(result.appliedFormatProps).toContain("fill");
    expect(result.appliedFormatProps).toContain("alignment");
    expect(result.appliedFormatProps).toContain("numberFormat");
    expect(result.appliedFormatProps).toContain("borders");
    expect(result.mergedApplied).toBe(true);
    expect(result.autofitApplied).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Output: handle pass-through
  // -------------------------------------------------------------------------

  it("handle pass-through — same handle when no renewal", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse({ json: {} }));

    const handle = makeHandle({ sessionId: "STYLE-SESS" });
    const cfg: ExcelStyleRangeOptions = { handle, sheet: "Sheet1", range: "A1", font: { bold: true } };

    const result = await executeExcelStyleRange(makeSession() as never, cfg, {});

    expect(result.sessionId).toBe("STYLE-SESS");
  });

  // -------------------------------------------------------------------------
  // Regression #6: font-only run goes to /format/font, NOT coalesced into /format
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

    const cfg: ExcelStyleRangeOptions = {
      handle: makeHandle(),
      sheet: "Sheet1",
      range: "B2:D4",
      font: { bold: true, color: "#FF0000" },
    };

    await executeExcelStyleRange(makeSession() as never, cfg, {});

    const fontReq = capturedRequests.find((r) => r.url.endsWith("/format/font"));
    const fillReq = capturedRequests.find((r) => r.url.endsWith("/format/fill"));
    const topFormatReq = capturedRequests.find((r) => r.url.endsWith("/format"));

    expect(fontReq).toBeDefined();
    expect(fontReq!.body).toEqual({ bold: true, color: "#FF0000" });

    expect(fillReq).toBeUndefined();

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

    const cfg: ExcelStyleRangeOptions = {
      handle: makeHandle(),
      sheet: "Sheet1",
      range: "A1:C3",
      fill: { color: "#EEEEEE" },
    };

    await executeExcelStyleRange(makeSession() as never, cfg, {});

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

    const cfg: ExcelStyleRangeOptions = { handle: makeHandle(), sheet: "Sheet1", range: "A1" };

    const result = await executeExcelStyleRange(makeSession() as never, cfg, {});

    expect(capturedRequests).toHaveLength(0);
    expect(result.appliedFormatProps).toHaveLength(0);
  });
});
