/**
 * Tests for ExcelOpenWorkbookNode.
 *
 * fetch is stubbed by saving/restoring globalThis.fetch manually (no vi.stubGlobal).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeExcelOpenWorkbook } from "../../src/excel/excelOpenWorkbookNode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(token = "tok") {
  return {
    accessToken: token,
    refresh: vi.fn().mockResolvedValue(token),
  };
}

function makeCreateSessionResponse(sessionId: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: {
      get: () => null,
      getSetCookie: () => ["ARRAffinity=abc; Path=/"],
    } as unknown as Headers,
    json: async () => ({ id: sessionId }),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executeExcelOpenWorkbook", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("happy path — returns a WorkbookHandle", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      globalThis.fetch = vi.fn().mockResolvedValue(makeCreateSessionResponse("SESSION-XYZ"));

      const session = makeSession();
      const result = await executeExcelOpenWorkbook(session as never, { driveId: "drive-1", itemId: "item-1" }, {});

      expect(result.sessionId).toBe("SESSION-XYZ");
      expect(result.driveId).toBe("drive-1");
      expect(result.itemId).toBe("item-1");
      expect(result.persistChanges).toBe(true); // default
      expect(Array.isArray(result.cookies)).toBe(true);
      const fakeNow = new Date("2026-01-01T00:00:00.000Z").getTime();
      expect(result.expiresAt).toBe(fakeNow + 7 * 60_000 - 30_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("defaults persistChanges to true when omitted from cfg", async () => {
    let capturedBody: { persistChanges?: boolean } | undefined;

    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string) as { persistChanges?: boolean };
      return makeCreateSessionResponse("S-1");
    });

    const session = makeSession();
    await executeExcelOpenWorkbook(session as never, { driveId: "d", itemId: "i" }, {});

    expect(capturedBody?.persistChanges).toBe(true);
  });

  // Regression #5: empty cfg driveId/itemId must fall back to item.json
  it("falls back to item.json driveId and itemId when cfg values are empty strings", async () => {
    let capturedFetchUrl: string | undefined;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedFetchUrl = url;
      return makeCreateSessionResponse("SESSION-FALLBACK");
    });

    const session = makeSession();
    // Upstream DriveResolve emits { driveId, itemId } in item.json
    const result = await executeExcelOpenWorkbook(
      session as never,
      { driveId: "", itemId: "" },
      { driveId: "DR1", itemId: "I1" },
    );

    expect(capturedFetchUrl).toContain("DR1");
    expect(capturedFetchUrl).toContain("I1");

    expect(result.driveId).toBe("DR1");
    expect(result.itemId).toBe("I1");
    expect(result.sessionId).toBe("SESSION-FALLBACK");
  });
});
