import assert from "node:assert/strict";
import { test } from "vitest";

import type { SignInResponse } from "next-auth/react";

import { CredentialsSignInRedirectResolver } from "../src/shell/CredentialsSignInRedirectResolver";

function response(partial: Partial<SignInResponse>): SignInResponse {
  return {
    error: undefined,
    code: undefined,
    status: 200,
    ok: true,
    url: null,
    ...partial,
  };
}

test("returns null when error is set", () => {
  const target = CredentialsSignInRedirectResolver.resolveRedirectUrl(
    response({ error: "CredentialsSignin", ok: false, status: 401 }),
    "/",
  );
  assert.equal(target, null);
});

test("returns url when present and non-empty", () => {
  const target = CredentialsSignInRedirectResolver.resolveRedirectUrl(
    response({ url: "http://127.0.0.1:3001/", ok: true, status: 200 }),
    "/fallback",
  );
  assert.equal(target, "http://127.0.0.1:3001/");
});

test("falls back to callbackUrl when ok is true and url is null", () => {
  const target = CredentialsSignInRedirectResolver.resolveRedirectUrl(
    response({ url: null, ok: true, status: 200 }),
    "/workflows",
  );
  assert.equal(target, "/workflows");
});

test("falls back to callbackUrl when ok is true and url is whitespace-only", () => {
  const target = CredentialsSignInRedirectResolver.resolveRedirectUrl(
    response({ url: "   ", ok: true, status: 200 }),
    "/",
  );
  assert.equal(target, "/");
});

test("returns null when not ok and no usable url", () => {
  const target = CredentialsSignInRedirectResolver.resolveRedirectUrl(
    response({ ok: false, status: 500, url: null }),
    "/",
  );
  assert.equal(target, null);
});
