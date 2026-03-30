import assert from "node:assert/strict";
import path from "node:path";
import { test } from "vitest";
import nextConfig from "../next.config";

test("next config pins turbopack root to the surrounding node_modules workspace", () => {
  assert.deepEqual(nextConfig.turbopack, {
    root: path.resolve(import.meta.dirname, "..", "..", ".."),
  });
});

test("next config builds a standalone runtime for packaged consumers", () => {
  assert.equal(nextConfig.output, "standalone");
});

test("next config keeps browser source maps available for packaged debugging", () => {
  assert.equal(nextConfig.productionBrowserSourceMaps, true);
});

test("next config bundles websocket helpers instead of externalizing hashed runtime aliases", () => {
  assert.ok(!nextConfig.serverExternalPackages?.includes("ws"));
  assert.ok(!nextConfig.serverExternalPackages?.includes("bufferutil"));
  assert.ok(!nextConfig.serverExternalPackages?.includes("utf-8-validate"));
});
