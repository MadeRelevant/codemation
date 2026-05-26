/**
 * Unit tests for InboxChannelResolver (Story 05).
 *
 * Coverage:
 * 1. Returns local channel when PairingConfig is null.
 * 2. Returns CP channel (+ workspaceId) when PairingConfig present and CP registered.
 * 3. Falls back to local and logs a warn when PairingConfig present but CP not registered.
 * 4. Throws a clear error when neither local nor CP channel is registered.
 */
import assert from "node:assert/strict";
import { describe, test } from "vitest";

import type { InboxChannel, InboxDeliverArgs, InboxDelivery } from "@codemation/core";
import { InboxChannelResolver } from "../../src/hitl/InboxChannelResolver";
import type { Logger } from "../../src/application/logging/Logger";
import type { ServerLoggerFactory } from "../../src/infrastructure/logging/ServerLoggerFactory";
import type { PairingConfig } from "../../src/pairing/pairing.types";

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

class CapturingLogger implements Logger {
  readonly warns: string[] = [];
  info(): void {}
  warn(message: string): void {
    this.warns.push(message);
  }
  error(): void {}
  debug(): void {}
}

class StubLoggerFactory {
  readonly logger = new CapturingLogger();
  create(): Logger {
    return this.logger;
  }
}

function makeLoggerFactory(): { factory: StubLoggerFactory; logger: CapturingLogger } {
  const factory = new StubLoggerFactory();
  return { factory, logger: factory.logger };
}

function makeChannel(kind: "local" | "control-plane-inbox"): InboxChannel {
  return {
    kind,
    async deliver(_args: InboxDeliverArgs): Promise<InboxDelivery> {
      if (kind === "local") return { kind: "local", inboxItemId: "local-item-1" };
      return { kind: "cp", inboxItemId: "cp-item-1", workspaceId: "ws_test" };
    },
  };
}

function makePairingConfig(workspaceId = "ws_test"): PairingConfig {
  return {
    workspaceId,
    pairingSecret: Buffer.alloc(32, 0xab).toString("base64"),
    controlPlaneUrl: "https://cp.example.com",
  };
}

// ---------------------------------------------------------------------------
// Helper: construct the resolver without DI container
// ---------------------------------------------------------------------------

function makeResolver(args: {
  pairingConfig: PairingConfig | null;
  local: InboxChannel | null;
  cp: InboxChannel | null;
  loggerFactory?: StubLoggerFactory;
}): { resolver: InboxChannelResolver; logger: CapturingLogger } {
  const { factory, logger } = args.loggerFactory
    ? { factory: args.loggerFactory, logger: args.loggerFactory.logger }
    : makeLoggerFactory();
  const resolver = new InboxChannelResolver(
    args.pairingConfig,
    args.local,
    args.cp,
    factory as unknown as ServerLoggerFactory,
  );
  return { resolver, logger };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("InboxChannelResolver", () => {
  test("returns local channel when PairingConfig is null", () => {
    const local = makeChannel("local");
    const { resolver } = makeResolver({ pairingConfig: null, local, cp: null });

    const result = resolver.resolve();

    assert.equal(result.channel, local);
    assert.equal(result.workspaceId, undefined);
  });

  test("returns CP channel and workspaceId when PairingConfig present and CP registered", () => {
    const local = makeChannel("local");
    const cp = makeChannel("control-plane-inbox");
    const pairing = makePairingConfig("ws_managed");
    const { resolver } = makeResolver({ pairingConfig: pairing, local, cp });

    const result = resolver.resolve();

    assert.equal(result.channel, cp);
    assert.equal(result.workspaceId, "ws_managed");
  });

  test("falls back to local and emits a warn when PairingConfig set but CP not registered", () => {
    const local = makeChannel("local");
    const pairing = makePairingConfig();
    const { resolver, logger } = makeResolver({ pairingConfig: pairing, local, cp: null });

    const result = resolver.resolve();

    assert.equal(result.channel, local);
    assert.equal(result.workspaceId, undefined);
    assert.ok(logger.warns.length > 0, "should have emitted at least one warn");
    assert.ok(
      logger.warns[0]?.includes("managed mode is active but no ControlPlaneInboxChannel"),
      `unexpected warn: ${logger.warns[0]}`,
    );
  });

  test("throws a clear error when no channel is registered", () => {
    const { resolver } = makeResolver({ pairingConfig: null, local: null, cp: null });

    assert.throws(() => resolver.resolve(), /no inbox channel is registered/);
  });
});
