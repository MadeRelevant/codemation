/**
 * Tests for ExcelCloseWorkbookNode.
 *
 * fetch is stubbed by saving/restoring globalThis.fetch manually (no vi.stubGlobal).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeExcelCloseWorkbook } from "../../src/excel/excelCloseWorkbookNode";
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
    driveId: "drive-1",
    itemId: "item-1",
    sessionId: "SESSION-ABC",
    expiresAt: new Date("2026-01-01T00:06:00.000Z").getTime(),
    cookies: ["ARRAffinity=abc; Path=/; HttpOnly"],
    persistChanges: true,
    ...overrides,
  };
}

function makeCloseSessionResponse(status: number, json?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 204 ? "No Content" : "OK",
    headers: {
      get: () => (status === 204 ? null : "application/json"),
    } as unknown as Headers,
    json: async () => json ?? {},
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("executeExcelCloseWorkbook", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("happy path — returns { closed: true }", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeCloseSessionResponse(204));

    const handle = makeHandle();
    const session = makeSession();
    const result = await executeExcelCloseWorkbook(session as never, { handle }, handle);

    expect(result.closed).toBe(true);
  });

  it("is idempotent — resolves without throwing on WACSessionExpired (400)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeCloseSessionResponse(400, {
        error: { code: "WACSessionExpired", message: "Already expired." },
      }),
    );

    const handle = makeHandle();
    const session = makeSession();
    const result = await executeExcelCloseWorkbook(session as never, { handle }, handle);
    expect(result.closed).toBe(true);
  });

  it("falls back to item.json handle when cfg.handle is undefined", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeCloseSessionResponse(204));

    const handle = makeHandle();
    const session = makeSession();
    // Pass undefined handle in cfg, but provide handle as itemJson
    const result = await executeExcelCloseWorkbook(session as never, {}, handle);
    expect(result.closed).toBe(true);
  });
});
