/**
 * Tests for ExcelOpenWorkbookNode.
 *
 * fetch is stubbed by saving/restoring globalThis.fetch manually (no vi.stubGlobal).
 * execute() args shape mirrors the framework's RunnableNodeExecuteArgs where
 * the node calls `const { ctx } = args` and then `ctx.config`, `ctx.getCredential`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExcelOpenWorkbook, ExcelOpenWorkbookNode } from "../../src/excel/excelOpenWorkbookNode";
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

/** Build an execute args mock. The node does `const { ctx } = args; ctx.config...` */
function makeArgs(
  cfg: { driveId: string; itemId: string; persistChanges?: boolean },
  getCredentialImpl: () => Promise<unknown>,
) {
  const config = new ExcelOpenWorkbook("open", cfg);
  return {
    item: { json: {}, binary: {} },
    ctx: {
      config,
      getCredential: vi.fn().mockImplementation(getCredentialImpl),
      binary: {},
    },
  } as unknown as Parameters<ExcelOpenWorkbookNode["execute"]>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExcelOpenWorkbookNode", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("happy path — returns an item with a WorkbookHandle", async () => {
    // Use fake timers for deterministic expiresAt assertion
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    try {
      globalThis.fetch = vi.fn().mockResolvedValue(makeCreateSessionResponse("SESSION-XYZ"));

      const node = new ExcelOpenWorkbookNode();
      const args = makeArgs({ driveId: "drive-1", itemId: "item-1" }, () => Promise.resolve(makeSession()));

      const result = await node.execute(args);

      const output = (result as { json: { handle: WorkbookHandle } }).json;
      expect(output.handle.sessionId).toBe("SESSION-XYZ");
      expect(output.handle.driveId).toBe("drive-1");
      expect(output.handle.itemId).toBe("item-1");
      expect(output.handle.persistChanges).toBe(true); // default
      expect(Array.isArray(output.handle.cookies)).toBe(true);
      // expiresAt = now + 7 min - 30s = now + 390_000ms
      const fakeNow = new Date("2026-01-01T00:00:00.000Z").getTime();
      expect(output.handle.expiresAt).toBe(fakeNow + 7 * 60_000 - 30_000);
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

    const node = new ExcelOpenWorkbookNode();
    // cfg without persistChanges — schema default should apply
    const rawCfg: { driveId: string; itemId: string; persistChanges?: boolean } = {
      driveId: "d",
      itemId: "i",
    };
    const args = makeArgs(rawCfg, () => Promise.resolve(makeSession()));

    await node.execute(args);

    expect(capturedBody?.persistChanges).toBe(true);
  });

  it("uses the credential from ctx.getCredential('auth')", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeCreateSessionResponse("S-2"));

    const node = new ExcelOpenWorkbookNode();
    const getCredential = vi.fn().mockResolvedValue(makeSession());
    const config = new ExcelOpenWorkbook("open", { driveId: "d", itemId: "i" });

    const args = {
      item: { json: {}, binary: {} },
      ctx: { config, getCredential, binary: {} },
    } as unknown as Parameters<typeof node.execute>[0];

    await node.execute(args);

    expect(getCredential).toHaveBeenCalledWith("auth");
  });
});
