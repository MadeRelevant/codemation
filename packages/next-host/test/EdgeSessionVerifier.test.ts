import assert from "node:assert/strict";
import { afterEach, test } from "vitest";

import { EdgeSessionVerifier } from "../src/auth/EdgeSessionVerifier";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("EdgeSessionVerifier treats a non-null host auth session payload as authenticated", async () => {
  globalThis.fetch = async (input, init) => {
    assert.equal(String(input), "http://localhost:3001/api/auth/session");
    assert.equal(init?.cache, "no-store");
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("cookie"), "session=value");
    assert.equal(headers.get("origin"), "http://localhost:3001");
    return new Response(JSON.stringify({ id: "user-1", email: "user@example.com" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const request = {
    headers: new Headers({ cookie: "session=value" }),
    nextUrl: new URL("http://localhost:3001/workflows"),
  } as never;

  assert.equal(await EdgeSessionVerifier.hasAuthenticatedSession(request, "unused"), true);
});

test("EdgeSessionVerifier treats a null host auth session payload as anonymous", async () => {
  globalThis.fetch = async () =>
    new Response("null", {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  const request = {
    headers: new Headers(),
    nextUrl: new URL("http://localhost:3001/workflows"),
  } as never;

  assert.equal(await EdgeSessionVerifier.hasAuthenticatedSession(request, "unused"), false);
});
