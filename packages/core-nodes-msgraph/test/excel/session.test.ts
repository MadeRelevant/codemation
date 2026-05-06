/**
 * Tests for the Excel workbook session infrastructure (src/excel/session.ts).
 *
 * ESLint rules in this repo forbid vi.mock / vi.stubGlobal / vi.stubEnv.
 * All fetch stubs are applied by saving & restoring globalThis.fetch manually
 * in afterEach. vi.useFakeTimers() + vi.setSystemTime() control Date.now().
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbookHandle } from "../../src/excel/session";
import { closeWorkbookSession, openWorkbookSession, workbookFetch } from "../../src/excel/session";
import type { MsGraphSession } from "../../src/credentials/session";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSession(token = "access-token"): MsGraphSession {
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
    expiresAt: new Date("2026-01-01T00:06:00.000Z").getTime(),
    cookies: ["ARRAffinity=abc123; Path=/; HttpOnly", "FedAuth=xyz; Path=/; Secure"],
    persistChanges: true,
    ...overrides,
  };
}

/** Build a minimal Response-like object for fetch stubs */
function makeFetchResponse(opts: {
  status?: number;
  json?: unknown;
  headers?: Record<string, string>;
  setCookies?: string[];
}): Response {
  const { status = 200, json, headers = {}, setCookies = [] } = opts;

  // Build a Headers object that simulates getSetCookie (modern Node) and
  // falls back gracefully.
  const headersMap = new Map<string, string | string[]>(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  if (setCookies.length > 0) {
    headersMap.set("set-cookie", setCookies);
  }
  // Auto-set content-type when json payload is provided so rawWorkbookFetch parses it
  if (json !== undefined && !headersMap.has("content-type")) {
    headersMap.set("content-type", "application/json");
  }

  const headersObj = {
    get(name: string): string | null {
      const val = headersMap.get(name.toLowerCase());
      if (Array.isArray(val)) return val.join(", ");
      return val ?? null;
    },
    getSetCookie(): string[] {
      const val = headersMap.get("set-cookie");
      if (Array.isArray(val)) return val;
      return val ? [val] : [];
    },
  } as unknown as Headers;

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : status === 404 ? "Not Found" : String(status),
    headers: headersObj,
    json: async () => json,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// 1. openWorkbookSession happy path
// ---------------------------------------------------------------------------

describe("openWorkbookSession", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("happy path — returns handle with sessionId, cookies, driveId, itemId, expiresAt", async () => {
    const setCookies = ["ARRAffinity=affin1; Path=/; HttpOnly", "FedAuth=fedauth1; Path=/; Secure; SameSite=None"];

    globalThis.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({
        status: 200,
        json: { id: "SESSION-123" },
        setCookies,
      }),
    );

    const session = makeSession("tok-123");
    const handle = await openWorkbookSession({
      session,
      driveId: "driveA",
      itemId: "itemB",
      persistChanges: true,
    });

    expect(handle.sessionId).toBe("SESSION-123");
    expect(handle.driveId).toBe("driveA");
    expect(handle.itemId).toBe("itemB");
    expect(handle.persistChanges).toBe(true);
    expect(handle.cookies).toEqual(setCookies);

    // expiresAt should be ~7 minutes from now minus 30s margin
    const now = new Date("2026-01-01T00:00:00.000Z").getTime();
    const expectedExpiry = now + 7 * 60_000 - 30_000;
    expect(handle.expiresAt).toBe(expectedExpiry);
  });

  it("sends persistChanges in the request body", async () => {
    let capturedBody: unknown;
    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string);
      return makeFetchResponse({ status: 200, json: { id: "S-1" }, setCookies: ["a=b"] });
    });

    await openWorkbookSession({
      session: makeSession(),
      driveId: "d1",
      itemId: "i1",
      persistChanges: false,
    });

    expect(capturedBody).toEqual({ persistChanges: false });
  });
});

// ---------------------------------------------------------------------------
// 2. workbookFetch injects session id + cookies
// ---------------------------------------------------------------------------

describe("workbookFetch — header injection", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("injects workbook-session-id and Cookie headers (strips attributes)", async () => {
    let capturedInit: RequestInit | undefined;

    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedInit = init;
      return makeFetchResponse({ status: 200, json: { value: "ok" } });
    });

    const handle = makeHandle({
      sessionId: "SESSION-ABC",
      cookies: ["ARRAffinity=abc123; Path=/; HttpOnly", "FedAuth=xyz789; Path=/; Secure"],
    });

    await workbookFetch({
      session: makeSession(),
      handle,
      method: "GET",
      path: "/drives/driveA/items/itemB/workbook/worksheets",
    });

    expect(capturedInit).toBeDefined();
    const headers = capturedInit!.headers as Record<string, string>;
    expect(headers["workbook-session-id"]).toBe("SESSION-ABC");
    // Only name=value pair, no attributes
    expect(headers["Cookie"]).toBe("ARRAffinity=abc123; FedAuth=xyz789");
  });

  it("strips cookie attributes including those with spaces", async () => {
    let capturedCookieHeader: string | undefined;

    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedCookieHeader = (init.headers as Record<string, string>)["Cookie"];
      return makeFetchResponse({ status: 200, json: {} });
    });

    const handle = makeHandle({
      cookies: ["foo=bar; Path=/; HttpOnly", "baz=qux; Expires=Tue, 19-Jan-2038 03:14:07 GMT; Secure"],
    });

    await workbookFetch({
      session: makeSession(),
      handle,
      method: "GET",
      path: "/test",
    });

    // Should only have the name=value pairs, no attributes
    expect(capturedCookieHeader).toBe("foo=bar; baz=qux");
  });
});

// ---------------------------------------------------------------------------
// 3. workbookFetch happy path — returns json, same handle
// ---------------------------------------------------------------------------

describe("workbookFetch — happy path", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns parsed json and the same handle when no renewal occurs", async () => {
    const responseJson = { value: [{ id: "ws1" }] };
    globalThis.fetch = vi.fn().mockResolvedValue(makeFetchResponse({ status: 200, json: responseJson }));

    const handle = makeHandle();
    const result = await workbookFetch({
      session: makeSession(),
      handle,
      method: "GET",
      path: "/drives/driveA/items/itemB/workbook/worksheets",
    });

    expect(result.json).toEqual(responseJson);
    expect(result.handle).toBe(handle); // exact same reference
    expect(result.bytes).toBeUndefined();
  });

  it("appends query parameters to the URL", async () => {
    let capturedUrl: string | undefined;

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      capturedUrl = url;
      return makeFetchResponse({ status: 200, json: {} });
    });

    await workbookFetch({
      session: makeSession(),
      handle: makeHandle(),
      method: "GET",
      path: "/drives/driveA/items/itemB/workbook/worksheets",
      query: { $select: "id,name" },
    });

    // URLSearchParams encodes '$' as '%24' and ',' as '%2C'
    expect(capturedUrl).toContain("%24select=id%2Cname");
  });
});

// ---------------------------------------------------------------------------
// 4. Auto-renew on session-expired error
// ---------------------------------------------------------------------------

describe("workbookFetch — auto-renew on session-expired", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("renews once on WACSessionExpired and returns success with new handle", async () => {
    const sessionExpiredBody = {
      error: { code: "WACSessionExpired", message: "The workbook session has expired." },
    };
    const createSessionBody = { id: "NEW-SESSION-999" };
    const successBody = { value: [{ address: "Sheet1!A1" }] };

    const fetchCalls: string[] = [];
    const newCookies = ["ARRAffinity=new-affin; Path=/; HttpOnly"];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      fetchCalls.push(url as string);

      if ((url as string).includes("createSession")) {
        return makeFetchResponse({
          status: 200,
          json: createSessionBody,
          setCookies: newCookies,
        });
      }

      // First call to the original URL: session expired
      if (fetchCalls.filter((u) => !u.includes("createSession")).length === 1) {
        return makeFetchResponse({ status: 404, json: sessionExpiredBody });
      }

      // Second call (after renewal): success
      return makeFetchResponse({ status: 200, json: successBody });
    });

    const handle = makeHandle({ sessionId: "OLD-SESSION" });
    const result = await workbookFetch({
      session: makeSession(),
      handle,
      method: "GET",
      path: "/drives/driveA/items/itemB/workbook/worksheets",
    });

    // Exactly ONE createSession call
    const createSessionCalls = fetchCalls.filter((u) => u.includes("createSession"));
    expect(createSessionCalls).toHaveLength(1);

    // Returned handle has the new session id
    expect(result.handle.sessionId).toBe("NEW-SESSION-999");
    expect(result.handle.cookies).toEqual(newCookies);

    // Returned json is the success payload
    expect(result.json).toEqual(successBody);
  });

  it("renews exactly once — does NOT loop on second session-expired failure", async () => {
    const sessionExpiredBody = {
      error: { code: "WACSessionExpired", message: "Expired." },
    };
    const createSessionBody = { id: "NEW-SESSION-AAA" };

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if ((url as string).includes("createSession")) {
        return makeFetchResponse({ status: 200, json: createSessionBody, setCookies: ["a=b"] });
      }
      // Both the original call AND the retry return session-expired 404
      return makeFetchResponse({ status: 404, json: sessionExpiredBody });
    });

    const handle = makeHandle();
    await expect(
      workbookFetch({
        session: makeSession(),
        handle,
        method: "GET",
        path: "/drives/driveA/items/itemB/workbook/worksheets",
      }),
    ).rejects.toMatchObject({ statusCode: 404 });

    // createSession called once (not infinitely)
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    const createSessionCalls = mockFetch.mock.calls.filter((args: unknown[]) =>
      (args[0] as string).includes("createSession"),
    );
    expect(createSessionCalls).toHaveLength(1);
  });

  it("does NOT renew on second failure — bubbles the error", async () => {
    const sessionExpiredBody = {
      error: { code: "WACSessionExpired", message: "Expired." },
    };
    const createSessionBody = { id: "NEW-SESSION-BBB" };
    const serverErrorBody = { error: { code: "InternalError", message: "Server exploded." } };

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      if ((url as string).includes("createSession")) {
        return makeFetchResponse({ status: 200, json: createSessionBody, setCookies: ["a=b"] });
      }
      // Alternate: first call → session expired; second call → 500
      const mockFn = globalThis.fetch as ReturnType<typeof vi.fn>;
      const nonSessionCalls = mockFn.mock.calls.filter(
        (args: unknown[]) => !(args[0] as string).includes("createSession"),
      );
      if (nonSessionCalls.length <= 1) {
        return makeFetchResponse({ status: 404, json: sessionExpiredBody });
      }
      return makeFetchResponse({ status: 500, json: serverErrorBody });
    });

    const handle = makeHandle();
    await expect(
      workbookFetch({
        session: makeSession(),
        handle,
        method: "GET",
        path: "/drives/driveA/items/itemB/workbook/worksheets",
      }),
    ).rejects.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 5. No renewal on unrelated error
// ---------------------------------------------------------------------------

describe("workbookFetch — no renewal on unrelated error", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("bubbles immediately on 400 with unrelated error code", async () => {
    const badRequestBody = {
      error: { code: "BadRequest", message: "Invalid range address." },
    };

    let fetchCallCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      fetchCallCount++;
      return makeFetchResponse({ status: 400, json: badRequestBody });
    });

    const handle = makeHandle();
    await expect(
      workbookFetch({
        session: makeSession(),
        handle,
        method: "PATCH",
        path: "/drives/driveA/items/itemB/workbook/worksheets('Sheet1')/range(address='A1')",
        body: { values: [[1]] },
      }),
    ).rejects.toMatchObject({ statusCode: 400 });

    // 400 is not in RETRYABLE_STATUS_CODES, so only 1 fetch call
    expect(fetchCallCount).toBe(1);

    // No createSession calls
    const mockFetch = globalThis.fetch as ReturnType<typeof vi.fn>;
    const createSessionCalls = mockFetch.mock.calls.filter((args: unknown[]) =>
      (args[0] as string).includes("createSession"),
    );
    expect(createSessionCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6. closeWorkbookSession idempotent
// ---------------------------------------------------------------------------

describe("closeWorkbookSession", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("resolves without throwing when Graph returns 400 WACSessionExpired", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({
        status: 400,
        json: { error: { code: "WACSessionExpired", message: "Session expired." } },
      }),
    );

    const handle = makeHandle();
    await expect(closeWorkbookSession({ session: makeSession(), handle })).resolves.toBeUndefined();
  });

  it("resolves without throwing when Graph returns 404", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({
        status: 404,
        json: { error: { code: "ItemNotFound", message: "Session not found." } },
      }),
    );

    const handle = makeHandle();
    await expect(closeWorkbookSession({ session: makeSession(), handle })).resolves.toBeUndefined();
  });

  it("throws on 500 unrelated error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({
        status: 500,
        json: { error: { code: "InternalServerError", message: "Something went wrong." } },
      }),
    );

    const handle = makeHandle();
    await expect(closeWorkbookSession({ session: makeSession(), handle })).rejects.toMatchObject({
      statusCode: 500,
    });
  });

  it("throws on 401 unauthorized — auth failure is not silently swallowed", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      makeFetchResponse({
        status: 401,
        json: { error: { code: "Unauthorized", message: "Access token is expired." } },
      }),
    );

    const handle = makeHandle();
    await expect(closeWorkbookSession({ session: makeSession(), handle })).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it("sends workbook-session-id and cookies on closeSession request", async () => {
    let capturedHeaders: Record<string, string> | undefined;

    globalThis.fetch = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      capturedHeaders = init.headers as Record<string, string>;
      return makeFetchResponse({ status: 204 });
    });

    const handle = makeHandle({
      sessionId: "CLOSE-SESSION-XYZ",
      cookies: ["token=abc; Path=/; HttpOnly"],
    });

    await closeWorkbookSession({ session: makeSession(), handle });

    expect(capturedHeaders?.["workbook-session-id"]).toBe("CLOSE-SESSION-XYZ");
    expect(capturedHeaders?.["Cookie"]).toBe("token=abc");
  });
});

// ---------------------------------------------------------------------------
// 7. Set-Cookie capture portability
// ---------------------------------------------------------------------------

describe("Set-Cookie capture portability", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  const expectedCookies = ["ARRAffinity=abc123; Path=/; HttpOnly", "FedAuth=xyz789; Path=/; Secure; SameSite=None"];

  it("path 1: headers.getSetCookie() exists (modern Node)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      (() => {
        const headersObj = {
          get(_name: string): string | null {
            return null;
          },
          getSetCookie(): string[] {
            return expectedCookies;
          },
        } as unknown as Headers;

        return {
          ok: true,
          status: 200,
          statusText: "OK",
          headers: headersObj,
          json: async () => ({ id: "SESSION-PATH1" }),
        } as unknown as Response;
      })(),
    );

    const handle = await openWorkbookSession({
      session: makeSession(),
      driveId: "d",
      itemId: "i",
      persistChanges: true,
    });

    expect(handle.cookies).toEqual(expectedCookies);
  });

  it("path 2: headers.raw() exists (node-fetch style)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      (() => {
        const headersObj = {
          get(_name: string): string | null {
            return null;
          },
          // No getSetCookie — simulates node-fetch
          raw(): Record<string, string[]> {
            return { "set-cookie": expectedCookies };
          },
        } as unknown as Headers;

        return {
          ok: true,
          status: 200,
          statusText: "OK",
          headers: headersObj,
          json: async () => ({ id: "SESSION-PATH2" }),
        } as unknown as Response;
      })(),
    );

    const handle = await openWorkbookSession({
      session: makeSession(),
      driveId: "d",
      itemId: "i",
      persistChanges: true,
    });

    expect(handle.cookies).toEqual(expectedCookies);
  });

  it("path 3: headers.get('set-cookie') returns joined string (proxy fallback)", async () => {
    // Note: commas in Expires must NOT be split. We include one to validate
    // the split regex is safe.
    const cookiesWithExpires = [
      "ARRAffinity=abc123; Path=/; HttpOnly",
      "FedAuth=xyz789; Expires=Tue, 19-Jan-2038 03:14:07 GMT; Secure",
    ];

    globalThis.fetch = vi.fn().mockResolvedValue(
      (() => {
        const headersObj = {
          get(name: string): string | null {
            if (name.toLowerCase() === "set-cookie") {
              // A proxy may join multiple Set-Cookie headers with ", "
              return cookiesWithExpires.join(", ");
            }
            return null;
          },
          // No getSetCookie, no raw — simulates a minimal proxy-stripped response
        } as unknown as Headers;

        return {
          ok: true,
          status: 200,
          statusText: "OK",
          headers: headersObj,
          json: async () => ({ id: "SESSION-PATH3" }),
        } as unknown as Response;
      })(),
    );

    const handle = await openWorkbookSession({
      session: makeSession(),
      driveId: "d",
      itemId: "i",
      persistChanges: true,
    });

    // Should have exactly 2 cookies, NOT split on the comma in "Expires=Tue, 19-Jan..."
    expect(handle.cookies).toHaveLength(2);
    expect(handle.cookies[0]).toBe("ARRAffinity=abc123; Path=/; HttpOnly");
    expect(handle.cookies[1]).toBe("FedAuth=xyz789; Expires=Tue, 19-Jan-2038 03:14:07 GMT; Secure");
  });
});
