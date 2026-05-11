"use client";

import { useContext, useMemo } from "react";

import { RealtimeContext } from "../../components/realtime/RealtimeContext";

export type BadgeState =
  | Readonly<{ kind: "ok" }>
  | Readonly<{ kind: "reloading" }>
  | Readonly<{ kind: "errored"; message: string; file?: string; line?: number; column?: number }>
  | Readonly<{ kind: "disconnected" }>;

const RELOADING_TIMEOUT_MS = 2000;

export function useWorkflowRealtimeBadgeState(): BadgeState {
  const context = useContext(RealtimeContext);

  return useMemo(() => {
    if (!context) {
      return { kind: "ok" };
    }

    const { buildState, lastBuildError, buildStateLastChangedAt, showDisconnectedBadge } = context;

    // buildState === "building" → { kind: "reloading" }
    if (buildState === "building") {
      return { kind: "reloading" };
    }

    // buildState === "errored" → { kind: "errored", message, file, line, column }
    if (buildState === "errored" && lastBuildError) {
      return {
        kind: "errored",
        message: lastBuildError.message,
        ...(lastBuildError.file ? { file: lastBuildError.file } : {}),
        ...(typeof lastBuildError.line === "number" ? { line: lastBuildError.line } : {}),
        ...(typeof lastBuildError.column === "number" ? { column: lastBuildError.column } : {}),
      };
    }

    // showDisconnectedBadge AND buildState === "idle" for ≥ 2s → { kind: "disconnected" }
    const timeSinceBuildStateChange = Date.now() - buildStateLastChangedAt;
    if (showDisconnectedBadge && buildState === "idle" && timeSinceBuildStateChange >= RELOADING_TIMEOUT_MS) {
      return { kind: "disconnected" };
    }

    // else → { kind: "ok" }
    return { kind: "ok" };
  }, [context]);
}

export function useWorkflowRealtimeShowDisconnectedBadge(): boolean {
  const badgeState = useWorkflowRealtimeBadgeState();
  return badgeState.kind === "disconnected";
}
