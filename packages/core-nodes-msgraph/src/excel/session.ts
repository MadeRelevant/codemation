/**
 * Excel workbook session infrastructure.
 *
 * Microsoft Graph Excel API requires "session affinity" — every workbook API
 * call after `createSession` must include:
 *   1. The `workbook-session-id` response header value.
 *   2. The same cookies that the `createSession` response set.
 *
 * Without the cookies, subsequent calls may hit a different Graph backend
 * instance and fail with "session not found". This module encapsulates all
 * session management so C2–C6 nodes never have to think about it.
 *
 * Sessions expire after ~7 minutes idle. `workbookFetch` auto-renews
 * transparently on session-expired errors (404 + WACSessionExpired code or
 * similar). Auto-renew is one-shot per call — if the retried request fails
 * again, the error bubbles to the caller.
 *
 * There is NO automatic run-end cleanup. Consumers MUST call
 * `ExcelCloseWorkbookNode` explicitly. See `ExcelOpenWorkbookNode` docs.
 */

import type { MsGraphSession } from "../credentials/session";
import { withGraphRetry } from "../lib/graphRetry";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GRAPH_BASE_URL = "https://graph.microsoft.com/v1.0";

/**
 * Safety margin subtracted from the 7-minute session lifetime so we treat
 * the session as expired before Graph does.
 */
const SESSION_EXPIRY_MARGIN_MS = 30_000;

/**
 * Nominal Graph workbook session lifetime: 7 minutes.
 */
const SESSION_LIFETIME_MS = 7 * 60_000;

// ---------------------------------------------------------------------------
// WorkbookHandle
// ---------------------------------------------------------------------------

/**
 * Opaque handle representing an open workbook session on Microsoft Graph.
 *
 * Pass this to every Excel node. When a call auto-renews the session, the
 * returned handle will have a new `sessionId` and `expiresAt` — always use
 * the returned handle for subsequent calls.
 */
export type WorkbookHandle = Readonly<{
  driveId: string;
  itemId: string;
  sessionId: string;
  /**
   * Epoch milliseconds. Computed as `Date.now() + 7*60_000 - safety_margin`.
   * Graph does not return an expiry; this is an approximation for observability.
   */
  expiresAt: number;
  /**
   * Raw `Set-Cookie` header values captured verbatim from `createSession`.
   * Stored so subsequent calls can replay exactly the same cookie jar.
   */
  cookies: ReadonlyArray<string>;
  persistChanges: boolean;
}>;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Extract Set-Cookie header values from a `Response`, tolerating three
 * different fetch implementations in the wild:
 *
 * 1. Modern Node 20+ native fetch — `headers.getSetCookie()` returns `string[]`.
 * 2. `node-fetch` — `headers.raw()["set-cookie"]` is `string[]`.
 * 3. Fallback — `headers.get("set-cookie")` returns a single joined string.
 *    Graph normally sends each cookie on its own header, but some proxies
 *    collapse them. We split on `,` only before `name=` tokens to avoid
 *    corrupting `Expires=Tue, 19-Jan-2038` date values.
 */
function extractSetCookies(headers: Headers): string[] {
  // Path 1: modern Node / undici native fetch
  if (typeof (headers as unknown as { getSetCookie?: () => string[] }).getSetCookie === "function") {
    return (headers as unknown as { getSetCookie: () => string[] }).getSetCookie();
  }

  // Path 2: node-fetch headers with .raw()
  if (typeof (headers as unknown as { raw?: () => Record<string, string[]> }).raw === "function") {
    const raw = (headers as unknown as { raw: () => Record<string, string[]> }).raw();
    const values = raw["set-cookie"];
    if (Array.isArray(values)) return values as string[];
  }

  // Path 3: single joined string — split carefully at cookie boundaries
  const joined = headers.get("set-cookie");
  if (!joined) return [];

  // Split only where a comma is immediately followed by what looks like
  // `token=` (cookie name=value). Cookie attributes like "Expires=Tue, 19-Jan"
  // are safe because the date portion doesn't start with `token=` pattern.
  return joined.split(/,\s*(?=[A-Za-z0-9_!#$%&'*+\-.^`|~]+=)/);
}

/**
 * Build the `Cookie` request header value from stored `Set-Cookie` strings.
 * Only the `name=value` pair (everything before the first `;`) is sent —
 * attributes like `Path`, `HttpOnly`, `Expires` are server-side directives.
 */
function buildCookieHeader(cookies: ReadonlyArray<string>): string {
  return cookies.map((c) => c.split(";")[0].trim()).join("; ");
}

/**
 * Determine whether an error represents a workbook session that is no longer
 * valid on the Graph backend. The criteria (per Graph docs):
 * - HTTP 404 (item / session not found)
 * - error code contains "session", "WACSession", or is "InvalidArgument" / "itemNotFound"
 */
function isSessionExpiredError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const status = typeof e["statusCode"] === "number" ? e["statusCode"] : undefined;
  if (status !== 404) return false;

  // Try to read the Graph error code from the response body
  const body = e["body"] as Record<string, unknown> | undefined;
  const errorObj = body?.["error"] as Record<string, unknown> | undefined;
  const code = typeof errorObj?.["code"] === "string" ? (errorObj["code"] as string) : "";
  const message = typeof errorObj?.["message"] === "string" ? (errorObj["message"] as string) : "";

  if (!code && !message) {
    // 404 with no parseable code — treat as session-expired conservatively
    return true;
  }

  const sessionRelated =
    code.toLowerCase().includes("session") ||
    message.toLowerCase().includes("session") ||
    code === "InvalidArgument" ||
    code === "itemNotFound" ||
    code === "WACSessionExpired" ||
    code === "BadGateway";

  return sessionRelated;
}

/**
 * Low-level fetch wrapper.
 *
 * Sends a raw `fetch()` request to Graph with the appropriate session headers.
 * On non-2xx, throws an error carrying `statusCode` (read by `withGraphRetry`)
 * and `body` (read by `isSessionExpiredError`).
 */
async function rawWorkbookFetch(args: {
  session: MsGraphSession;
  handle: WorkbookHandle;
  method: string;
  url: string;
  body?: unknown;
  expectsBinary?: boolean;
}): Promise<{ status: number; json?: unknown; bytes?: Buffer }> {
  const { session, handle, method, url, body, expectsBinary } = args;

  const token = await session.refresh();
  const cookieHeader = buildCookieHeader(handle.cookies);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "workbook-session-id": handle.sessionId,
  };

  if (cookieHeader) {
    headers["Cookie"] = cookieHeader;
  }

  let requestInit: RequestInit = { method, headers };

  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    requestInit = { ...requestInit, body: JSON.stringify(body) };
  }

  const response = await fetch(url, requestInit);

  if (!response.ok) {
    // Attempt to read body for error details
    let errorBody: unknown;
    try {
      errorBody = await response.json();
    } catch {
      errorBody = { error: { code: "UnknownError", message: response.statusText } };
    }
    const err = Object.assign(new Error(`Graph workbook request failed: ${response.status} ${response.statusText}`), {
      statusCode: response.status,
      body: errorBody,
    });
    throw err;
  }

  if (expectsBinary) {
    const ab = await response.arrayBuffer();
    return { status: response.status, bytes: Buffer.from(ab) };
  }

  // Parse JSON only if there's a body
  const contentType = response.headers.get("content-type") ?? "";
  if (response.status !== 204 && contentType.includes("json")) {
    const json = await response.json();
    return { status: response.status, json };
  }

  return { status: response.status };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Open a workbook session on Microsoft Graph.
 *
 * Issues POST `/drives/{driveId}/items/{itemId}/workbook/createSession`.
 * Captures `Set-Cookie` headers and the session `id` from the response body.
 *
 * Wrapped in `withGraphRetry` — transient 429/5xx are retried automatically.
 *
 * @returns A `WorkbookHandle` that must be passed to every subsequent workbook
 *   call and ultimately to `closeWorkbookSession`.
 */
export async function openWorkbookSession(args: {
  session: MsGraphSession;
  driveId: string;
  itemId: string;
  persistChanges: boolean;
}): Promise<WorkbookHandle> {
  const { session, driveId, itemId, persistChanges } = args;
  const url = `${GRAPH_BASE_URL}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/workbook/createSession`;

  return withGraphRetry(async () => {
    const token = await session.refresh();

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ persistChanges }),
    });

    if (!response.ok) {
      let errorBody: unknown;
      try {
        errorBody = await response.json();
      } catch {
        errorBody = { error: { code: "UnknownError", message: response.statusText } };
      }
      throw Object.assign(new Error(`createSession failed: ${response.status} ${response.statusText}`), {
        statusCode: response.status,
        body: errorBody,
      });
    }

    const cookies = extractSetCookies(response.headers);
    const responseBody = (await response.json()) as { id: string };
    const sessionId = responseBody.id;

    const handle: WorkbookHandle = {
      driveId,
      itemId,
      sessionId,
      expiresAt: Date.now() + SESSION_LIFETIME_MS - SESSION_EXPIRY_MARGIN_MS,
      cookies,
      persistChanges,
    };

    return handle;
  });
}

/**
 * Close a workbook session on Microsoft Graph.
 *
 * Issues POST `/drives/{driveId}/items/{itemId}/workbook/closeSession`.
 * Idempotent — if the session has already expired or been closed (Graph
 * returns 4xx with `WACSessionExpired` / `BadGateway`), this resolves
 * without throwing. This matches the locked design: consumers call close
 * once as cleanup; intermittent expiry on the close itself is not an error.
 *
 * Wrapped in `withGraphRetry` — transient 429/5xx are retried automatically.
 */
export async function closeWorkbookSession(args: { session: MsGraphSession; handle: WorkbookHandle }): Promise<void> {
  const { session, handle } = args;
  const { driveId, itemId, sessionId, cookies } = handle;
  const url = `${GRAPH_BASE_URL}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/workbook/closeSession`;

  try {
    await withGraphRetry(async () => {
      const token = await session.refresh();
      const cookieHeader = buildCookieHeader(cookies);

      const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        "workbook-session-id": sessionId,
        "Content-Type": "application/json",
      };

      if (cookieHeader) {
        headers["Cookie"] = cookieHeader;
      }

      const response = await fetch(url, { method: "POST", headers });

      if (!response.ok) {
        let errorBody: unknown;
        try {
          errorBody = await response.json();
        } catch {
          errorBody = { error: { code: "UnknownError", message: response.statusText } };
        }
        throw Object.assign(new Error(`closeSession failed: ${response.status} ${response.statusText}`), {
          statusCode: response.status,
          body: errorBody,
        });
      }
    });
  } catch (err: unknown) {
    // Treat already-expired or already-closed sessions as success
    if (isAlreadyClosedError(err)) return;
    throw err;
  }
}

/**
 * Returns true if the error indicates the session is already gone — either
 * it was never valid, already closed, or timed out on Graph's side.
 *
 * Only returns true for specific session-expired codes. Auth failures (401),
 * permission errors (403), and other 4xx errors are NOT treated as idempotent
 * — those surface to the caller as real errors.
 */
function isAlreadyClosedError(err: unknown): boolean {
  if (err === null || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  const status = typeof e["statusCode"] === "number" ? e["statusCode"] : undefined;

  // Only 4xx (not 429 which is handled by retry, not auth/permission codes)
  if (status === undefined || status < 400 || status >= 500 || status === 429) return false;

  const body = e["body"] as Record<string, unknown> | undefined;
  const errorObj = body?.["error"] as Record<string, unknown> | undefined;
  const code = typeof errorObj?.["code"] === "string" ? (errorObj["code"] as string) : "";

  // Allowlisted session-gone codes only — don't swallow auth/permission failures
  return (
    code === "WACSessionExpired" ||
    code === "BadGateway" ||
    code === "ItemNotFound" ||
    code.toLowerCase().includes("session")
  );
}

/**
 * Send a workbook API request, automatically injecting the session id and
 * cookies required for Graph backend affinity.
 *
 * If the request fails with a session-expired error (404 + session-related
 * code), the session is renewed ONCE and the original request is retried.
 * This is one-shot — if the retried request also fails, the error bubbles
 * to the caller without further renewal.
 *
 * The returned `handle` may differ from `args.handle` if a session renewal
 * occurred. Callers MUST use the returned handle for subsequent calls.
 *
 * Wrapped in `withGraphRetry` — transient 429/5xx inside each attempt are
 * retried per the retry policy before session-renewal is considered.
 */
export async function workbookFetch(args: {
  session: MsGraphSession;
  handle: WorkbookHandle;
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  expectsBinary?: boolean;
}): Promise<{ status: number; json?: unknown; bytes?: Buffer; handle: WorkbookHandle }> {
  const { session, handle, method, path, query, body, expectsBinary } = args;

  const queryString = query && Object.keys(query).length > 0 ? "?" + new URLSearchParams(query).toString() : "";
  const url = `${GRAPH_BASE_URL}${path}${queryString}`;

  const doFetch = (currentHandle: WorkbookHandle) =>
    withGraphRetry(() => rawWorkbookFetch({ session, handle: currentHandle, method, url, body, expectsBinary }));

  try {
    const result = await doFetch(handle);
    return { ...result, handle };
  } catch (firstErr: unknown) {
    if (!isSessionExpiredError(firstErr)) throw firstErr;

    // One-shot renewal: open a new session, retry once
    const newHandle = await openWorkbookSession({
      session,
      driveId: handle.driveId,
      itemId: handle.itemId,
      persistChanges: handle.persistChanges,
    });

    // If this throws, it bubbles directly — no further renewal
    const result = await doFetch(newHandle);
    return { ...result, handle: newHandle };
  }
}
