"use client";

import { useContext } from "react";

import { RealtimeContext } from "../../components/realtime/RealtimeContext";

export function useWorkflowRealtimeShowDisconnectedBadge(): boolean {
  return useContext(RealtimeContext)?.showDisconnectedBadge ?? false;
}
