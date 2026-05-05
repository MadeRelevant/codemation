/**
 * Tests for ExcelCloseWorkbookNode.
 *
 * fetch is stubbed by saving/restoring globalThis.fetch manually (no vi.stubGlobal).
 * execute() args shape mirrors the framework: node calls `const { ctx } = args`,
 * then `ctx.config`, `ctx.getCredential`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExcelCloseWorkbook, ExcelCloseWorkbookNode } from "../../src/excel/excelCloseWorkbookNode";
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

/** Build execute args with the correct shape (node does `const { ctx } = args`) */
function makeArgs(handle: WorkbookHandle, getCredentialImpl: () => Promise<unknown>) {
  const config = new ExcelCloseWorkbook("close", { handle });
  return {
    item: { json: handle, binary: {} },
    ctx: {
      config,
      getCredential: vi.fn().mockImplementation(getCredentialImpl),
      binary: {},
    },
  } as unknown as Parameters<ExcelCloseWorkbookNode["execute"]>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExcelCloseWorkbookNode", () => {
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
    const node = new ExcelCloseWorkbookNode();
    const args = makeArgs(handle, () => Promise.resolve(makeSession()));

    const result = await node.execute(args);

    const output = (result as { json: { closed: boolean } }).json;
    expect(output.closed).toBe(true);
  });

  it("is idempotent — resolves without throwing on WACSessionExpired (400)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeCloseSessionResponse(400, {
        error: { code: "WACSessionExpired", message: "Already expired." },
      }),
    );

    const handle = makeHandle();
    const node = new ExcelCloseWorkbookNode();
    const args = makeArgs(handle, () => Promise.resolve(makeSession()));

    const result = await node.execute(args);
    const output = (result as { json: { closed: boolean } }).json;
    expect(output.closed).toBe(true);
  });

  it("calls ctx.getCredential('auth')", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeCloseSessionResponse(204));

    const handle = makeHandle();
    const node = new ExcelCloseWorkbookNode();
    const getCredential = vi.fn().mockResolvedValue(makeSession());
    const config = new ExcelCloseWorkbook("close", { handle });

    const args = {
      item: { json: handle, binary: {} },
      ctx: { config, getCredential, binary: {} },
    } as unknown as Parameters<typeof node.execute>[0];

    await node.execute(args);

    expect(getCredential).toHaveBeenCalledWith("auth");
  });
});
