"use client";

import { createContext } from "react";

import type { RetainWorkflowSubscription } from "../../lib/realtime/realtimeClientBridge";

export type RealtimeContextValue = Readonly<{
  retainWorkflowSubscription: RetainWorkflowSubscription;
  isConnected: boolean;
  /**
   * True when the workflow websocket is not open after at least one successful connection (includes reconnecting).
   * Avoids flashing: unlike raw CLOSED-only, this stays on while CONNECTING.
   */
  showDisconnectedBadge: boolean;
  /** Transient banner after a successful reconnect (a few seconds, then hidden). */
  showRealtimeConnectedBanner: boolean;
}>;

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);
