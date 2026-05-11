"use client";

import { createContext } from "react";

import type {
  RetainRunSubscription,
  RetainWorkflowSubscription,
  RealtimeReadyValue,
} from "../../realtime/realtimeClientBridge";

export type RealtimeContextValue = Readonly<{
  retainWorkflowSubscription: RetainWorkflowSubscription;
  retainRunSubscription: RetainRunSubscription;
  isConnected: boolean;
  /** True when the workflow websocket transport is closed (not while connecting or before the first socket opens). */
  showDisconnectedBadge: boolean;
  readyState: RealtimeReadyValue;
  buildState: "idle" | "building" | "errored";
  lastBuildError: {
    message: string;
    file?: string;
    line?: number;
    column?: number;
  } | null;
  buildStateLastChangedAt: number;
}>;

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);
