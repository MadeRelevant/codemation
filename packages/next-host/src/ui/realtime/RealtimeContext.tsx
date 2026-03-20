"use client";

import { createContext } from "react";

import type { RetainWorkflowSubscription } from "./realtimeClientBridge";

export type RealtimeContextValue = Readonly<{
  retainWorkflowSubscription: RetainWorkflowSubscription;
  isConnected: boolean;
}>;

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);
