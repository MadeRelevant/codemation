/**
 * Graph-aware retry wrapper.
 *
 * Retries on the transient HTTP status codes that Microsoft Graph returns during
 * throttling and service-side hiccups: 429 (Too Many Requests), 502 (Bad Gateway),
 * 503 (Service Unavailable), 504 (Gateway Timeout).
 *
 * On 429/503, Graph may include a `Retry-After` response header; this wrapper
 * honours it (seconds integer OR HTTP-date per RFC 7231) and falls back to
 * jittered exponential backoff for all other cases.
 *
 * The `sleep` option is injectable for unit-testing without real timers.
 */

const RETRYABLE_STATUS_CODES = new Set([429, 502, 503, 504]);

export type GraphRetryOptions = Readonly<{
  /** Maximum number of attempts (including the first). Default: 5. */
  maxAttempts?: number;
  /** Base delay for exponential backoff in milliseconds. Default: 250. */
  baseDelayMs?: number;
  /** Maximum delay cap in milliseconds. Default: 30_000. */
  maxDelayMs?: number;
  /** Apply ±25 % jitter to the computed delay. Default: true. */
  jitter?: boolean;
  /**
   * Sleep function. Defaults to `(ms) => new Promise(r => setTimeout(r, ms))`.
   * Inject a no-op or fake in tests.
   */
  sleep?: (ms: number) => Promise<void>;
}>;

/**
 * Inspect a thrown error for the HTTP status code.
 * Graph SDK errors typically expose `statusCode`; plain `fetch` Response-derived
 * errors may expose `status`.
 */
function getStatusCode(err: unknown): number | undefined {
  if (err !== null && typeof err === "object") {
    const e = err as Record<string, unknown>;
    if (typeof e["statusCode"] === "number") return e["statusCode"] as number;
    if (typeof e["status"] === "number") return e["status"] as number;
  }
  return undefined;
}

/**
 * Extract the `Retry-After` header value from a thrown error if one is present.
 *
 * The Graph SDK exposes response headers via `err.headers` which is either a
 * plain object or a `Headers`-like object with a `.get()` method.
 */
function getRetryAfterMs(err: unknown): number | undefined {
  if (err === null || typeof err !== "object") return undefined;
  const e = err as Record<string, unknown>;
  const headers = e["headers"];
  if (headers === undefined || headers === null) return undefined;

  let value: string | null | undefined;
  if (typeof (headers as { get?: unknown }).get === "function") {
    // Headers-like object (e.g. node-fetch / undici)
    value = (headers as { get(name: string): string | null }).get("retry-after");
  } else if (typeof headers === "object") {
    // Plain object — try both casings Graph SDKs have been observed to use
    const h = headers as Record<string, string | undefined>;
    value = h["retry-after"] ?? h["Retry-After"];
  }

  if (typeof value !== "string" || !value) return undefined;

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    // Seconds integer
    return asNumber * 1_000;
  }

  // HTTP-date (RFC 7231 §7.1.3)
  const asDate = Date.parse(value);
  if (Number.isFinite(asDate)) {
    const delta = asDate - Date.now();
    return delta > 0 ? delta : 0;
  }

  return undefined;
}

function computeDelay(
  attempt: number,
  opts: Required<Pick<GraphRetryOptions, "baseDelayMs" | "maxDelayMs" | "jitter">>,
): number {
  // Exponential: baseDelay * 2^(attempt-1), capped at maxDelayMs
  const exp = opts.baseDelayMs * Math.pow(2, attempt - 1);
  const capped = Math.min(exp, opts.maxDelayMs);
  if (!opts.jitter) return capped;
  // ±25 % jitter
  const factor = 0.75 + Math.random() * 0.5;
  return Math.round(capped * factor);
}

const defaultSleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wrap a Graph API call in transient-error retry logic.
 *
 * @param fn   Async function that performs the Graph request. Called up to `maxAttempts` times.
 * @param opts Retry tuning. All fields are optional; defaults are conservative but sensible for Graph.
 *
 * @throws The original error from the final attempt if all retries are exhausted, or
 *         immediately for non-retryable errors (anything not in {429, 502, 503, 504}).
 *
 * @example
 * const result = await withGraphRetry(() => client.api("/me/messages").get());
 */
export async function withGraphRetry<T>(fn: () => Promise<T>, opts: GraphRetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 5;
  const baseDelayMs = opts.baseDelayMs ?? 250;
  const maxDelayMs = opts.maxDelayMs ?? 30_000;
  const jitter = opts.jitter ?? true;
  const sleep = opts.sleep ?? defaultSleep;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;

      const status = getStatusCode(err);
      if (status === undefined || !RETRYABLE_STATUS_CODES.has(status)) {
        // Non-retryable — surface immediately
        throw err;
      }

      if (attempt === maxAttempts) {
        // Exhausted
        break;
      }

      // Determine how long to wait before the next attempt
      const retryAfterMs = getRetryAfterMs(err);
      const delayMs =
        retryAfterMs !== undefined
          ? Math.min(retryAfterMs, maxDelayMs)
          : computeDelay(attempt, { baseDelayMs, maxDelayMs, jitter });

      await sleep(delayMs);
    }
  }

  throw lastError;
}
