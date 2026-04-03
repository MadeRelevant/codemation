import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "vitest";

test("NextAuth route runs on nodejs and stays dynamic", () => {
  const routePath = path.resolve(import.meta.dirname, "..", "app", "api", "auth", "[...nextauth]", "route.ts");
  const source = readFileSync(routePath, "utf8");

  assert.match(source, /export const runtime = "nodejs";/);
  assert.match(source, /export const dynamic = "force-dynamic";/);
});
