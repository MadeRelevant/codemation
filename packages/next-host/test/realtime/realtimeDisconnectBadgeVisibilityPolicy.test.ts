import { describe, expect, it } from "vitest";

import { RealtimeReadyState } from "../../src/features/workflows/lib/realtime/realtimeClientBridge";
import { RealtimeDisconnectBadgeVisibilityPolicy } from "../../src/features/workflows/lib/realtime/RealtimeDisconnectBadgeVisibilityPolicy";

describe("RealtimeDisconnectBadgeVisibilityPolicy", () => {
  it("hides before the first successful websocket open", () => {
    expect(
      RealtimeDisconnectBadgeVisibilityPolicy.shouldShow({
        hasEverBeenOpen: false,
        shouldConnect: true,
        readyState: RealtimeReadyState.CLOSED,
      }),
    ).toBe(false);
  });

  it("stays visible while CONNECTING after a prior open (avoids flashing vs CLOSED-only)", () => {
    expect(
      RealtimeDisconnectBadgeVisibilityPolicy.shouldShow({
        hasEverBeenOpen: true,
        shouldConnect: true,
        readyState: RealtimeReadyState.CONNECTING,
      }),
    ).toBe(true);
  });

  it("hides when the socket is OPEN", () => {
    expect(
      RealtimeDisconnectBadgeVisibilityPolicy.shouldShow({
        hasEverBeenOpen: true,
        shouldConnect: true,
        readyState: RealtimeReadyState.OPEN,
      }),
    ).toBe(false);
  });

  it("hides when the workflow websocket is not configured", () => {
    expect(
      RealtimeDisconnectBadgeVisibilityPolicy.shouldShow({
        hasEverBeenOpen: true,
        shouldConnect: false,
        readyState: RealtimeReadyState.CLOSED,
      }),
    ).toBe(false);
  });
});
