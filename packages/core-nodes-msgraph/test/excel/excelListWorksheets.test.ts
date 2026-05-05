/**
 * Tests for ExcelListWorksheetsNode (C2).
 *
 * fetch is stubbed by saving/restoring globalThis.fetch manually.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExcelListWorksheets, ExcelListWorksheetsNode } from "../../src/excel/excelListWorksheetsNode";
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
  const headersMap = new Map<string, string>();
  if (json !== undefined) {
    headersMap.set("content-type", "application/json");
  }
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : String(status),
    headers: {
      get(name: string): string | null {
        return headersMap.get(name.toLowerCase()) ?? null;
      },
      getSetCookie(): string[] {
        return [];
      },
    } as unknown as Headers,
    json: async () => json,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

function makeArgs(cfg: { handle: WorkbookHandle }, getCredentialImpl: () => Promise<unknown>) {
  const config = new ExcelListWorksheets("listSheets", cfg);
  return {
    item: { json: {}, binary: {} },
    ctx: {
      config,
      getCredential: vi.fn().mockImplementation(getCredentialImpl),
      binary: {},
    },
  } as unknown as Parameters<ExcelListWorksheetsNode["execute"]>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExcelListWorksheetsNode", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("happy path — returns worksheets list with correct URL", async () => {
    const worksheetsResponse = {
      value: [
        { id: "ws1", name: "Sheet1", position: 0, visibility: "Visible" },
        { id: "ws2", name: "Sheet2", position: 1, visibility: "Hidden" },
        { id: "ws3", name: "VHSheet", position: 2, visibility: "VeryHidden" },
      ],
    };

    let capturedUrl: string | undefined;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return makeFetchResponse({ json: worksheetsResponse });
    });

    const handle = makeHandle();
    const node = new ExcelListWorksheetsNode();
    const args = makeArgs({ handle }, () => Promise.resolve(makeSession()));

    const result = await node.execute(args);
    const output = (result as { json: { handle: WorkbookHandle; worksheets: unknown[] } }).json;

    // Correct URL
    expect(capturedUrl).toBe("https://graph.microsoft.com/v1.0/drives/driveA/items/itemB/workbook/worksheets");

    // Worksheets content
    expect(output.worksheets).toHaveLength(3);
    expect(output.worksheets[0]).toEqual({ id: "ws1", name: "Sheet1", position: 0, visibility: "Visible" });
    expect(output.worksheets[1]).toEqual({ id: "ws2", name: "Sheet2", position: 1, visibility: "Hidden" });
    expect(output.worksheets[2]).toEqual({ id: "ws3", name: "VHSheet", position: 2, visibility: "VeryHidden" });
  });

  it("passes handle through to output when no session renewal", async () => {
    const worksheetsResponse = { value: [] };
    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse({ json: worksheetsResponse }));

    const handle = makeHandle({ sessionId: "MY-SESSION" });
    const node = new ExcelListWorksheetsNode();
    const args = makeArgs({ handle }, () => Promise.resolve(makeSession()));

    const result = await node.execute(args);
    const output = (result as { json: { handle: WorkbookHandle } }).json;

    // Same handle reference (no renewal)
    expect(output.handle.sessionId).toBe("MY-SESSION");
  });

  it("passes updated handle through when session was renewed", async () => {
    const sessionExpiredBody = {
      error: { code: "WACSessionExpired", message: "Session expired." },
    };
    const createSessionBody = { id: "NEW-SESSION-999" };
    const worksheetsResponse = { value: [{ id: "ws1", name: "Sheet1", position: 0, visibility: "Visible" }] };

    const fetchCalls: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      fetchCalls.push(url);

      if (url.includes("createSession")) {
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          headers: {
            get: () => "application/json",
            getSetCookie: () => ["ARRAffinity=new; Path=/"],
          } as unknown as Headers,
          json: async () => createSessionBody,
        } as unknown as Response;
      }

      // First real call: session expired
      if (fetchCalls.filter((u) => !u.includes("createSession")).length === 1) {
        return {
          ok: false,
          status: 404,
          statusText: "Not Found",
          headers: {
            get: () => "application/json",
            getSetCookie: () => [],
          } as unknown as Headers,
          json: async () => sessionExpiredBody,
        } as unknown as Response;
      }

      // Second real call: success
      return makeFetchResponse({ json: worksheetsResponse });
    });

    const handle = makeHandle({ sessionId: "OLD-SESSION" });
    const node = new ExcelListWorksheetsNode();
    const args = makeArgs({ handle }, () => Promise.resolve(makeSession()));

    const result = await node.execute(args);
    const output = (result as { json: { handle: WorkbookHandle } }).json;

    expect(output.handle.sessionId).toBe("NEW-SESSION-999");
  });

  it("visibility passthrough — all three visibility values are preserved", async () => {
    const worksheetsResponse = {
      value: [
        { id: "v1", name: "A", position: 0, visibility: "Visible" },
        { id: "v2", name: "B", position: 1, visibility: "Hidden" },
        { id: "v3", name: "C", position: 2, visibility: "VeryHidden" },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse({ json: worksheetsResponse }));

    const node = new ExcelListWorksheetsNode();
    const args = makeArgs({ handle: makeHandle() }, () => Promise.resolve(makeSession()));

    const result = await node.execute(args);
    const output = (result as { json: { worksheets: Array<{ visibility: string }> } }).json;

    const visibilities = output.worksheets.map((ws) => ws.visibility);
    expect(visibilities).toEqual(["Visible", "Hidden", "VeryHidden"]);
  });

  it("calls ctx.getCredential with 'auth'", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse({ json: { value: [] } }));

    const node = new ExcelListWorksheetsNode();
    const getCredential = vi.fn().mockResolvedValue(makeSession());
    const config = new ExcelListWorksheets("ls", { handle: makeHandle() });
    const args = {
      item: { json: {}, binary: {} },
      ctx: { config, getCredential, binary: {} },
    } as unknown as Parameters<typeof node.execute>[0];

    await node.execute(args);

    expect(getCredential).toHaveBeenCalledWith("auth");
  });
});
