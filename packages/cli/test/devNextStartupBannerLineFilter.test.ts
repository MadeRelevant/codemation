import assert from "node:assert/strict";
import { test } from "vitest";

import { DevNextStartupBannerLineFilter } from "../src/dev/DevNextStartupBannerLineFilter";

test("DevNextStartupBannerLineFilter suppresses typical next start banner lines", () => {
  const f = new DevNextStartupBannerLineFilter();
  assert.equal(f.shouldSuppress("▲ Next.js 16.2.2"), true);
  assert.equal(f.shouldSuppress("  - Local:         http://127.0.0.1:38281"), true);
  assert.equal(f.shouldSuppress("  - Network:       http://127.0.0.1:38281"), true);
  assert.equal(f.shouldSuppress("✓ Ready in 0ms"), true);
});

test("DevNextStartupBannerLineFilter forwards other lines", () => {
  const f = new DevNextStartupBannerLineFilter();
  assert.equal(f.shouldSuppress("Error: missing module"), false);
  assert.equal(f.shouldSuppress("✓ Compiled / in 120ms"), false);
  assert.equal(f.shouldSuppress(""), false);
});
