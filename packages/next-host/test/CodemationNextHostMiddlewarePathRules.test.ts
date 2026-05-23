import assert from "node:assert/strict";
import { test } from "vitest";

import { CodemationNextHostMiddlewarePathRules } from "../src/middleware/CodemationNextHostMiddlewarePathRules";

test("anonymous API routes include whitelabel logo path (login page img without session)", () => {
  assert.equal(CodemationNextHostMiddlewarePathRules.isAnonymousApiRoute("/api/whitelabel/logo"), true);
});

test("anonymous API routes include public bootstrap paths for SSR shell reads", () => {
  assert.equal(CodemationNextHostMiddlewarePathRules.isAnonymousApiRoute("/api/bootstrap/frontend"), true);
  assert.equal(CodemationNextHostMiddlewarePathRules.isAnonymousApiRoute("/api/bootstrap/auth/internal"), true);
});

test("anonymous API routes reject arbitrary api paths", () => {
  assert.equal(CodemationNextHostMiddlewarePathRules.isAnonymousApiRoute("/api/workflows"), false);
});

test("framework api routes include authenticated host api paths", () => {
  assert.equal(CodemationNextHostMiddlewarePathRules.isFrameworkApiRoute("/api/workflows"), true);
  assert.equal(
    CodemationNextHostMiddlewarePathRules.isFrameworkApiRoute("/api/workflows/wf.dev.canvasLayoutStress"),
    true,
  );
});

test("next static assets include well-known discovery paths", () => {
  assert.equal(
    CodemationNextHostMiddlewarePathRules.isNextStaticAsset("/.well-known/appspecific/com.chrome.devtools.json"),
    true,
  );
});

test("framework auth route matches /api/auth prefix", () => {
  assert.equal(CodemationNextHostMiddlewarePathRules.isFrameworkAuthRoute("/api/auth/signin"), true);
  assert.equal(CodemationNextHostMiddlewarePathRules.isFrameworkAuthRoute("/api/auth"), true);
  assert.equal(CodemationNextHostMiddlewarePathRules.isFrameworkAuthRoute("/api/workflows"), false);
});

test("public UI routes include /login, /login/, and /invite/ prefixes", () => {
  assert.equal(CodemationNextHostMiddlewarePathRules.isPublicUiRoute("/login"), true);
  assert.equal(CodemationNextHostMiddlewarePathRules.isPublicUiRoute("/login/sso"), true);
  assert.equal(CodemationNextHostMiddlewarePathRules.isPublicUiRoute("/invite/abc123"), true);
  assert.equal(CodemationNextHostMiddlewarePathRules.isPublicUiRoute("/dashboard"), false);
  assert.equal(CodemationNextHostMiddlewarePathRules.isPublicUiRoute("/"), false);
});

test("next static assets include _next, favicon, and public prefixes", () => {
  assert.equal(CodemationNextHostMiddlewarePathRules.isNextStaticAsset("/_next/static/chunks/main.js"), true);
  assert.equal(CodemationNextHostMiddlewarePathRules.isNextStaticAsset("/favicon.ico"), true);
  assert.equal(CodemationNextHostMiddlewarePathRules.isNextStaticAsset("/public/logo.png"), true);
  assert.equal(CodemationNextHostMiddlewarePathRules.isNextStaticAsset("/dashboard"), false);
});
