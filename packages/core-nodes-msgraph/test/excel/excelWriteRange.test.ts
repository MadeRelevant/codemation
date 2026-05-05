/**
 * Tests for ExcelWriteRangeNode (C4).
 *
 * fetch is stubbed by saving/restoring globalThis.fetch manually.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExcelWriteRange, ExcelWriteRangeNode } from "../../src/excel/excelWriteRangeNode";
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

function makeFetchResponse(opts: {
  status?: number;
  json?: unknown;
  captureInit?: (init: RequestInit) => void;
}): Response {
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
  cfg: {
    handle: WorkbookHandle;
    sheet: string;
    range?: string;
    values: unknown[][];
    appendBelow?: boolean;
  },
  getCredentialImpl: () => Promise<unknown>,
) {
  const config = new ExcelWriteRange("writeRange", cfg);
  return {
    item: { json: {}, binary: {} },
    ctx: {
      config,
      getCredential: vi.fn().mockImplementation(getCredentialImpl),
      binary: {},
    },
  } as unknown as Parameters<ExcelWriteRangeNode["execute"]>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ExcelWriteRangeNode", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("explicit range PATCH — correct URL and body", async () => {
    const capturedRequests: Array<{ url: string; method: string; body: unknown }> = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedRequests.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });
      return makeFetchResponse({
        json: { address: "Sheet1!A1:B2", rowCount: 2, columnCount: 2 },
      });
    });

    const values = [
      [1, 2],
      [3, 4],
    ];
    const node = new ExcelWriteRangeNode();
    const args = makeArgs({ handle: makeHandle(), sheet: "Sheet1", range: "A1:B2", values }, () =>
      Promise.resolve(makeSession()),
    );

    const result = await node.execute(args);
    const output = (result as { json: { address: string; rowCount: number; columnCount: number } }).json;

    // Exactly ONE request (no usedRange GET)
    expect(capturedRequests).toHaveLength(1);
    expect(capturedRequests[0].method).toBe("PATCH");
    expect(capturedRequests[0].url).toContain("range(address='A1:B2')");
    expect(capturedRequests[0].body).toEqual({ values });

    expect(output.address).toBe("Sheet1!A1:B2");
    expect(output.rowCount).toBe(2);
    expect(output.columnCount).toBe(2);
  });

  it("appendBelow=true — makes two calls: GET usedRange then PATCH on next row", async () => {
    const capturedRequests: Array<{ url: string; method: string; body: unknown }> = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedRequests.push({
        url,
        method: init.method ?? "GET",
        body: init.body ? JSON.parse(init.body as string) : undefined,
      });

      if (init.method === "GET" || !init.method) {
        // First call: usedRange response
        return makeFetchResponse({
          json: { address: "Sheet1!A1:C5", rowCount: 5, columnCount: 3 },
        });
      }

      // Second call: PATCH response
      return makeFetchResponse({
        json: { address: "Sheet1!A6:C7", rowCount: 2, columnCount: 3 },
      });
    });

    const values = [
      ["a", "b", "c"],
      ["d", "e", "f"],
    ];
    const node = new ExcelWriteRangeNode();
    const args = makeArgs({ handle: makeHandle(), sheet: "Sheet1", values, appendBelow: true }, () =>
      Promise.resolve(makeSession()),
    );

    await node.execute(args);

    // Two requests total
    expect(capturedRequests).toHaveLength(2);

    // First: GET usedRange
    expect(capturedRequests[0].method).toBe("GET");
    expect(capturedRequests[0].url).toContain("usedRange");

    // Second: PATCH on the next row (row 6, after 5 used rows)
    expect(capturedRequests[1].method).toBe("PATCH");
    // 3 columns: A1 width=3 → end col is C; next row = 6
    expect(capturedRequests[1].url).toContain("range(address='A6:C7')");
    expect(capturedRequests[1].body).toEqual({ values });
  });

  it("appendBelow with wide range uses correct column letters beyond Z", async () => {
    const capturedUrls: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init: RequestInit) => {
      capturedUrls.push(url);
      if (!init.method || init.method === "GET") {
        return makeFetchResponse({
          json: { address: "Sheet1!A1:AZ10", rowCount: 10, columnCount: 52 },
        });
      }
      return makeFetchResponse({
        json: { address: "Sheet1!A11:AZ12", rowCount: 2, columnCount: 52 },
      });
    });

    // 52-column wide values (Z=26, AZ=52)
    const row = Array.from({ length: 52 }, (_, i) => i);
    const values = [row, row];

    const node = new ExcelWriteRangeNode();
    const args = makeArgs({ handle: makeHandle(), sheet: "Sheet1", values, appendBelow: true }, () =>
      Promise.resolve(makeSession()),
    );

    await node.execute(args);

    const patchUrl = capturedUrls[1];
    // 52 columns → AZ; row 11 to 12
    expect(patchUrl).toContain("range(address='A11:AZ12')");
  });

  it("handle pass-through — same handle when no renewal", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({
        json: { address: "Sheet1!A1:B1", rowCount: 1, columnCount: 2 },
      }),
    );

    const handle = makeHandle({ sessionId: "SESS-WRITE" });
    const node = new ExcelWriteRangeNode();
    const args = makeArgs({ handle, sheet: "Sheet1", range: "A1:B1", values: [[1, 2]] }, () =>
      Promise.resolve(makeSession()),
    );

    const result = await node.execute(args);
    const output = (result as { json: WorkbookHandle }).json;

    expect(output.sessionId).toBe("SESS-WRITE");
  });

  it("single PATCH body shape — values wrapped correctly", async () => {
    let capturedBody: unknown;

    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return makeFetchResponse({
        json: { address: "Sheet1!A1:A1", rowCount: 1, columnCount: 1 },
      });
    });

    const node = new ExcelWriteRangeNode();
    const args = makeArgs({ handle: makeHandle(), sheet: "Sheet1", range: "A1:A1", values: [["hello"]] }, () =>
      Promise.resolve(makeSession()),
    );

    await node.execute(args);

    expect(capturedBody).toEqual({ values: [["hello"]] });
  });
});
