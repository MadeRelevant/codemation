/**
 * Tests for ExcelAddSheetNode (C5).
 *
 * fetch is stubbed by saving/restoring globalThis.fetch manually.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExcelAddSheet, ExcelAddSheetNode } from "../../src/excel/excelAddSheetNode";
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

function makeArgs(
  cfg: { handle: WorkbookHandle; name: string; copyFrom?: { sheetName: string } },
  getCredentialImpl: () => Promise<unknown>,
) {
  const config = new ExcelAddSheet("addSheet", cfg);
  return {
    item: { json: {}, binary: {} },
    ctx: {
      config,
      getCredential: vi.fn().mockImplementation(getCredentialImpl),
      binary: {},
    },
  } as unknown as Parameters<ExcelAddSheetNode["execute"]>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExcelAddSheetNode", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // -------------------------------------------------------------------------
  // Simple add (no copyFrom)
  // -------------------------------------------------------------------------

  it("simple add — POST to /worksheets/add with correct body and URL", async () => {
    const capturedRequests: Array<{ url: string; method: string; body: unknown }> = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedRequests.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });
      return makeFetchResponse({
        json: { id: "ws-new", name: "NewSheet", position: 3 },
      });
    });

    const node = new ExcelAddSheetNode();
    const args = makeArgs({ handle: makeHandle(), name: "NewSheet" }, () => Promise.resolve(makeSession()));

    const result = await node.execute(args);
    const output = (result as { json: { worksheet: { id: string; name: string; position: number } } }).json;

    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0].method).toBe("POST");
    expect(capturedRequests[0].url).toContain("/worksheets/add");
    expect(capturedRequests[0].body).toEqual({ name: "NewSheet" });

    expect(output.worksheet.id).toBe("ws-new");
    expect(output.worksheet.name).toBe("NewSheet");
    expect(output.worksheet.position).toBe(3);
  });

  it("simple add — handle pass-through", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(makeFetchResponse({ json: { id: "ws-1", name: "Sheet1", position: 0 } }));

    const handle = makeHandle({ sessionId: "ADD-SESS" });
    const node = new ExcelAddSheetNode();
    const args = makeArgs({ handle, name: "Sheet1" }, () => Promise.resolve(makeSession()));

    const result = await node.execute(args);
    const output = (result as { json: { handle: WorkbookHandle } }).json;

    expect(output.handle.sessionId).toBe("ADD-SESS");
  });

  // -------------------------------------------------------------------------
  // copyFrom path
  // -------------------------------------------------------------------------

  it("copyFrom — POST to copy endpoint with positionType and name, returns worksheet", async () => {
    const capturedRequests: Array<{ url: string; method: string; body: unknown }> = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedRequests.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });

      // Copy returns the new worksheet with the requested name already
      return makeFetchResponse({
        json: { id: "ws-copy", name: "NewCopy", position: 2 },
      });
    });

    const node = new ExcelAddSheetNode();
    const args = makeArgs({ handle: makeHandle(), name: "NewCopy", copyFrom: { sheetName: "Template" } }, () =>
      Promise.resolve(makeSession()),
    );

    const result = await node.execute(args);
    const output = (result as { json: { worksheet: { id: string; name: string } } }).json;

    // ONE request — copy honored the name
    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0].method).toBe("POST");
    expect(capturedRequests[0].url).toContain("worksheets('Template')/copy");
    expect(capturedRequests[0].body).toMatchObject({ positionType: "End", name: "NewCopy" });

    expect(output.worksheet.id).toBe("ws-copy");
    expect(output.worksheet.name).toBe("NewCopy");
  });

  it("copyFrom — rename-after-copy fallback when initial copy response doesn't carry requested name", async () => {
    const capturedRequests: Array<{ url: string; method: string; body: unknown }> = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedRequests.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });

      if (init.method === "POST") {
        // Copy returns a generic name — Graph didn't honour our name request
        return makeFetchResponse({
          json: { id: "ws-copy-id", name: "Template (2)", position: 2 },
        });
      }

      // PATCH rename — returns the renamed sheet
      return makeFetchResponse({
        json: { id: "ws-copy-id", name: "FinalName", position: 2 },
      });
    });

    const node = new ExcelAddSheetNode();
    const args = makeArgs({ handle: makeHandle(), name: "FinalName", copyFrom: { sheetName: "Template" } }, () =>
      Promise.resolve(makeSession()),
    );

    const result = await node.execute(args);
    const output = (result as { json: { worksheet: { name: string } } }).json;

    // Two requests: POST copy + PATCH rename
    expect(capturedRequests).toHaveLength(2);

    expect(capturedRequests[0].method).toBe("POST");
    expect(capturedRequests[0].url).toContain("/copy");

    expect(capturedRequests[1].method).toBe("PATCH");
    // Rename patches the copy's actual name, not the desired name
    expect(capturedRequests[1].url).toContain("Template%20(2)");
    expect(capturedRequests[1].body).toEqual({ name: "FinalName" });

    expect(output.worksheet.name).toBe("FinalName");
  });

  it("sheet names with spaces are URL-encoded in copy path", async () => {
    let capturedUrl: string | undefined;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return makeFetchResponse({
        json: { id: "ws-copy", name: "New Sheet", position: 1 },
      });
    });

    const node = new ExcelAddSheetNode();
    const args = makeArgs({ handle: makeHandle(), name: "New Sheet", copyFrom: { sheetName: "My Template" } }, () =>
      Promise.resolve(makeSession()),
    );

    await node.execute(args);

    expect(capturedUrl).toContain("worksheets('My%20Template')/copy");
  });
});
