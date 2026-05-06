import { describe, expect, it, vi } from "vitest";
import { withGraphRetry } from "../../src/lib/graphRetry";

// Helper: build a fake Graph-SDK-style error with statusCode and optional headers
function makeGraphError(
  statusCode: number,
  headers?: Record<string, string>,
): Error & { statusCode: number; headers?: Record<string, string> } {
  const err = new Error(`Graph error ${statusCode}`) as Error & {
    statusCode: number;
    headers?: Record<string, string>;
  };
  err.statusCode = statusCode;
  if (headers) err.headers = headers;
  return err;
}

// Helper: build an error that exposes status (fetch/Response style)
function makeFetchError(status: number): Error & { status: number } {
  const err = new Error(`Fetch error ${status}`) as Error & { status: number };
  err.status = status;
  return err;
}

describe("withGraphRetry", () => {
  it("returns the result immediately on success", async () => {
    const fn = vi.fn().mockResolvedValue({ value: "ok" });
    const result = await withGraphRetry(fn, { sleep: async () => {} });
    expect(result).toEqual({ value: "ok" });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on 429 and succeeds on second attempt", async () => {
    const sleepSpy = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValueOnce(makeGraphError(429)).mockResolvedValue("success");

    const result = await withGraphRetry(fn, { sleep: sleepSpy, jitter: false });
    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleepSpy).toHaveBeenCalledTimes(1);
  });

  it("retries on 503 and succeeds", async () => {
    const sleepSpy = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValueOnce(makeGraphError(503)).mockResolvedValue("ok");

    await withGraphRetry(fn, { sleep: sleepSpy, jitter: false });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on 502 and 504", async () => {
    const sleepSpy = vi.fn().mockResolvedValue(undefined);
    const fn502 = vi.fn().mockRejectedValueOnce(makeGraphError(502)).mockResolvedValue("ok502");
    await withGraphRetry(fn502, { sleep: sleepSpy, jitter: false });
    expect(fn502).toHaveBeenCalledTimes(2);

    const fn504 = vi.fn().mockRejectedValueOnce(makeGraphError(504)).mockResolvedValue("ok504");
    await withGraphRetry(fn504, { sleep: sleepSpy, jitter: false });
    expect(fn504).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry on non-retryable errors (e.g. 404)", async () => {
    const fn = vi.fn().mockRejectedValue(makeGraphError(404));
    await expect(withGraphRetry(fn, { sleep: async () => {}, jitter: false })).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("does NOT retry on non-retryable 500", async () => {
    const fn = vi.fn().mockRejectedValue(makeGraphError(500));
    await expect(withGraphRetry(fn, { sleep: async () => {}, jitter: false })).rejects.toMatchObject({
      statusCode: 500,
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("exhausts maxAttempts and throws the last error", async () => {
    const sleepSpy = vi.fn().mockResolvedValue(undefined);
    const err = makeGraphError(429);
    const fn = vi.fn().mockRejectedValue(err);

    await expect(withGraphRetry(fn, { maxAttempts: 3, sleep: sleepSpy, jitter: false })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleepSpy).toHaveBeenCalledTimes(2);
  });

  it("honours Retry-After header in seconds (plain object headers)", async () => {
    const sleepSpy = vi.fn().mockResolvedValue(undefined);
    const err = makeGraphError(429, { "retry-after": "5" });
    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue("ok");

    await withGraphRetry(fn, { sleep: sleepSpy, jitter: false });
    expect(sleepSpy).toHaveBeenCalledWith(5_000);
  });

  it("honours Retry-After header in seconds (Headers-like .get() interface)", async () => {
    const sleepSpy = vi.fn().mockResolvedValue(undefined);
    const headers = { get: (name: string) => (name === "retry-after" ? "3" : null) };
    const err = makeGraphError(429);
    (err as unknown as { headers: typeof headers }).headers = headers;

    const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue("ok");
    await withGraphRetry(fn, { sleep: sleepSpy, jitter: false });
    expect(sleepSpy).toHaveBeenCalledWith(3_000);
  });

  it("honours Retry-After header as an HTTP-date", async () => {
    const fixedNow = new Date("2026-01-01T12:00:00Z").getTime();
    vi.useFakeTimers();
    vi.setSystemTime(fixedNow);
    try {
      const sleepSpy = vi.fn().mockResolvedValue(undefined);
      // Set the date exactly 10 seconds in the future
      const futureDate = new Date(fixedNow + 10_000).toUTCString();
      const err = makeGraphError(429, { "retry-after": futureDate });
      const fn = vi.fn().mockRejectedValueOnce(err).mockResolvedValue("ok");

      await withGraphRetry(fn, { sleep: sleepSpy, jitter: false, maxDelayMs: 60_000 });
      const [calledWith] = sleepSpy.mock.calls[0] as [number];
      expect(calledWith).toBe(10_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses exponential backoff when no Retry-After header", async () => {
    const sleepSpy = vi.fn().mockResolvedValue(undefined);
    const fn = vi
      .fn()
      .mockRejectedValueOnce(makeGraphError(429))
      .mockRejectedValueOnce(makeGraphError(429))
      .mockResolvedValue("ok");

    await withGraphRetry(fn, { sleep: sleepSpy, jitter: false, baseDelayMs: 100, maxDelayMs: 10_000 });
    expect(sleepSpy).toHaveBeenNthCalledWith(1, 100); // 100 * 2^0
    expect(sleepSpy).toHaveBeenNthCalledWith(2, 200); // 100 * 2^1
  });

  it("caps delay at maxDelayMs", async () => {
    const sleepSpy = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValueOnce(makeGraphError(429)).mockResolvedValue("ok");

    await withGraphRetry(fn, { sleep: sleepSpy, jitter: false, baseDelayMs: 1_000, maxDelayMs: 500 });
    expect(sleepSpy).toHaveBeenCalledWith(500);
  });

  it("recognises status on fetch-style errors (err.status)", async () => {
    const sleepSpy = vi.fn().mockResolvedValue(undefined);
    const fn = vi.fn().mockRejectedValueOnce(makeFetchError(429)).mockResolvedValue("ok");

    await withGraphRetry(fn, { sleep: sleepSpy, jitter: false });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("re-throws immediately when the thrown value is not an object", async () => {
    const fn = vi.fn().mockRejectedValue("just a string");
    await expect(withGraphRetry(fn, { sleep: async () => {} })).rejects.toBe("just a string");
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
