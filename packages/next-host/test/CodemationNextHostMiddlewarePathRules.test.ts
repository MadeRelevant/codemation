import assert from "node:assert/strict";
import { test } from "vitest";

import { CodemationNextHostMiddlewarePathRules } from "../src/middleware/CodemationNextHostMiddlewarePathRules";

test("anonymous API routes include whitelabel logo path (login page img without session)", () => {
  assert.equal(CodemationNextHostMiddlewarePathRules.isAnonymousApiRoute("/api/whitelabel/logo"), true);
});

test("anonymous API routes reject arbitrary api paths", () => {
  assert.equal(CodemationNextHostMiddlewarePathRules.isAnonymousApiRoute("/api/workflows"), false);
});
