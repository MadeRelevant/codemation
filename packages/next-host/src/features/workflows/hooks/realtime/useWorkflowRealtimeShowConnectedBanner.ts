"use client";

import { useContext } from "react";

import { RealtimeContext } from "../../components/realtime/RealtimeContext";

export function useWorkflowRealtimeShowConnectedBanner(): boolean {
  return useContext(RealtimeContext)?.showRealtimeConnectedBanner ?? false;
}
