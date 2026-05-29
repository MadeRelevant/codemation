import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { ManagedCorsMiddleware } from "../../src/auth/managed/ManagedCorsMiddleware";

const ALLOWED_ORIGIN = "https://app.example.com";

function makeApp(allowedOrigin: string): Hono {
  const app = new Hono();
  const cors = new ManagedCorsMiddleware(allowedOrigin);
  app.use("*", cors.handle());
  app.get("/test", (c) => c.text("ok"));
  return app;
}

describe("ManagedCorsMiddleware.handle", () => {
  it("returns 204 for OPTIONS preflight from allowed origin", async () => {
    const app = makeApp(ALLOWED_ORIGIN);
    const res = await app.request("/test", {
      method: "OPTIONS",
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
  });

  it("returns 403 for OPTIONS preflight from disallowed origin", async () => {
    const app = makeApp(ALLOWED_ORIGIN);
    const res = await app.request("/test", {
      method: "OPTIONS",
      headers: { origin: "https://evil.com" },
    });
    expect(res.status).toBe(403);
  });

  it("returns 403 for OPTIONS preflight with no origin", async () => {
    const app = makeApp(ALLOWED_ORIGIN);
    const res = await app.request("/test", { method: "OPTIONS" });
    expect(res.status).toBe(403);
  });

  it("passes through GET request from allowed origin with CORS headers", async () => {
    const app = makeApp(ALLOWED_ORIGIN);
    const res = await app.request("/test", {
      method: "GET",
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
    expect(res.headers.get("access-control-allow-credentials")).toBe("true");
  });

  it("passes through GET request from disallowed origin without CORS headers", async () => {
    const app = makeApp(ALLOWED_ORIGIN);
    const res = await app.request("/test", {
      method: "GET",
      headers: { origin: "https://other.com" },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("passes through GET request with no origin header", async () => {
    const app = makeApp(ALLOWED_ORIGIN);
    const res = await app.request("/test", { method: "GET" });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
  });

  it("sets vary header on preflight response from allowed origin", async () => {
    const app = makeApp(ALLOWED_ORIGIN);
    const res = await app.request("/test", {
      method: "OPTIONS",
      headers: { origin: ALLOWED_ORIGIN },
    });
    expect(res.headers.get("vary")).toBe("Origin");
  });

  describe("comma-separated allowlist", () => {
    const MULTI = "http://app.localhost, http://localhost:3010";

    it("echoes the matching origin for each member of the allowlist", async () => {
      const app = makeApp(MULTI);
      for (const origin of ["http://app.localhost", "http://localhost:3010"]) {
        const res = await app.request("/test", { method: "OPTIONS", headers: { origin } });
        expect(res.status).toBe(204);
        expect(res.headers.get("access-control-allow-origin")).toBe(origin);
      }
    });

    it("does not match the joined string itself", async () => {
      const app = makeApp(MULTI);
      const res = await app.request("/test", {
        method: "OPTIONS",
        headers: { origin: MULTI },
      });
      expect(res.status).toBe(403);
    });

    it("refuses an origin outside the allowlist", async () => {
      const app = makeApp(MULTI);
      const res = await app.request("/test", {
        method: "OPTIONS",
        headers: { origin: "https://evil.com" },
      });
      expect(res.status).toBe(403);
    });
  });
});
