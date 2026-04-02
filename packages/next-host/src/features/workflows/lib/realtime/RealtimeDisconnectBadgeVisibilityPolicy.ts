import { RealtimeReadyState, type RealtimeReadyValue } from "./realtimeClientBridge";

/**
 * Keeps the “realtime disconnected” banner steady while the socket is reconnecting (CONNECTING),
 * instead of toggling off only for CLOSED which caused visible flashing.
 */
export class RealtimeDisconnectBadgeVisibilityPolicy {
  static shouldShow(
    args: Readonly<{
      hasEverBeenOpen: boolean;
      shouldConnect: boolean;
      readyState: RealtimeReadyValue;
    }>,
  ): boolean {
    return args.hasEverBeenOpen && args.shouldConnect && args.readyState !== RealtimeReadyState.OPEN;
  }
}
