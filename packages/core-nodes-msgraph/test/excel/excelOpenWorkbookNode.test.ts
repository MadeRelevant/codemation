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

      const output = (result as { json: WorkbookHandle }).json;
      expect(output.sessionId).toBe("SESSION-XYZ");
      expect(output.driveId).toBe("drive-1");
      expect(output.itemId).toBe("item-1");
      expect(output.persistChanges).toBe(true); // default
      expect(Array.isArray(output.cookies)).toBe(true);
      // expiresAt = now + 7 min - 30s = now + 390_000ms
      const fakeNow = new Date("2026-01-01T00:00:00.000Z").getTime();
      expect(output.expiresAt).toBe(fakeNow + 7 * 60_000 - 30_000);
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

  // Regression #5: empty cfg driveId/itemId must fall back to item.json
  it("falls back to item.json driveId and itemId when cfg values are empty strings", async () => {
    let capturedFetchUrl: string | undefined;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedFetchUrl = url;
      return makeCreateSessionResponse("SESSION-FALLBACK");
    });

    const node = new ExcelOpenWorkbookNode();
    // Pass empty cfg ids — the node must pick up item.json values instead
    const config = new ExcelOpenWorkbook("open", { driveId: "", itemId: "" });
    const args = {
      // Upstream DriveResolve emits { driveId, itemId } in item.json
      item: { json: { driveId: "DR1", itemId: "I1" }, binary: {} },
      ctx: {
        config,
        getCredential: vi.fn().mockResolvedValue(makeSession()),
        binary: {},
      },
    } as unknown as Parameters<typeof node.execute>[0];

    const result = await node.execute(args);

    // The fetch URL must contain the item.json driveId and itemId (not empty strings)
    expect(capturedFetchUrl).toContain("DR1");
    expect(capturedFetchUrl).toContain("I1");

    // The returned handle must reflect the resolved ids
    const handle = (result as { json: WorkbookHandle }).json;
    expect(handle.driveId).toBe("DR1");
    expect(handle.itemId).toBe("I1");
    expect(handle.sessionId).toBe("SESSION-FALLBACK");
  });
});
