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
