"use client";

import { createContext } from "react";

import type { RetainWorkflowSubscription } from "../../lib/realtime/realtimeClientBridge";

export type RealtimeContextValue = Readonly<{
  retainWorkflowSubscription: RetainWorkflowSubscription;
  isConnected: boolean;
  /** True when the workflow websocket transport is closed (not while connecting or before the first socket opens). */
  showDisconnectedBadge: boolean;
}>;

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);
