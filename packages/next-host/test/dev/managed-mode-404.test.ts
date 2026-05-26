/**
 * Tests for the /dev/inbox managed-mode 404 guard (Story 06).
 *
 * The layout calls `devInboxAccessGuard.check(pairingConfig)` which returns
 * "not-found" when a PairingConfig is present, triggering notFound().
 *
 * We test the guard directly — no need to render the async server component.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import { DevInboxAccessGuard } from "../../src/features/devInbox/DevInboxAccessGuard";
import type { PairingConfig } from "@codemation/host/pairing";

function makePairingConfig(workspaceId = "ws_managed"): PairingConfig {
  return {
    workspaceId,
    pairingSecret: Buffer.alloc(32, 0xab).toString("base64"),
    controlPlaneUrl: "https://cp.example.com",
  };
}

describe("DevInboxAccessGuard", () => {
  const guard = new DevInboxAccessGuard();

  test("returns 'render' when pairingConfig is null (non-managed mode)", () => {
    assert.equal(guard.check(null), "render");
  });

  test("returns 'not-found' when pairingConfig is present (managed mode)", () => {
    assert.equal(guard.check(makePairingConfig()), "not-found");
  });

  test("returns 'not-found' for any non-null pairingConfig", () => {
    const configs = [
      makePairingConfig("ws-1"),
      makePairingConfig("ws-2"),
      { workspaceId: "x", pairingSecret: "y", controlPlaneUrl: "z" } satisfies PairingConfig,
    ];
    for (const config of configs) {
      assert.equal(guard.check(config), "not-found", `expected not-found for workspaceId=${config.workspaceId}`);
    }
  });
});
