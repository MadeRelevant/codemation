import type { WorkflowEvent } from "./realtimeDomainTypes";

export type RealtimeServerMessage =
  | Readonly<{ kind: "ready" }>
  | Readonly<{ kind: "subscribed"; roomId: string }>
  | Readonly<{ kind: "unsubscribed"; roomId: string }>
  | Readonly<{ kind: "workflowChanged"; workflowId: string }>
  | Readonly<{ kind: "devBuildStarted"; workflowId: string; buildVersion?: string }>
  | Readonly<{ kind: "devBuildCompleted"; workflowId: string; buildVersion: string }>
  | Readonly<{ kind: "devBuildFailed"; workflowId: string; message: string }>
  | Readonly<{ kind: "event"; event: WorkflowEvent }>
  | Readonly<{ kind: "error"; message: string }>;

export type RealtimeClientMessage =
  | Readonly<{ kind: "subscribe"; roomId: string }>
  | Readonly<{ kind: "unsubscribe"; roomId: string }>;

export const minimumRealtimeActiveVisibilityMs = 300;

export const persistentRealtimeDisconnectWarningDelayMs = 5000;

/** How long to show the transient “realtime connected” banner after a successful reconnect. */
export const realtimeReconnectSuccessBannerMs = 3000;

export type RetainWorkflowSubscription = (workflowId: string) => () => void;

export type RealtimeBridgeState = {
  retainWorkflowSubscription: RetainWorkflowSubscription | null;
  listeners: Set<() => void>;
};

type RealtimeBridgeGlobal = typeof globalThis & {
  __codemationRealtimeBridge__?: RealtimeBridgeState;
};

export const RealtimeReadyState = {
  UNINSTANTIATED: -1,
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

export type RealtimeReadyValue = (typeof RealtimeReadyState)[keyof typeof RealtimeReadyState];

export function getRealtimeBridge(): RealtimeBridgeState {
  const realtimeGlobal = globalThis as RealtimeBridgeGlobal;
  if (!realtimeGlobal.__codemationRealtimeBridge__) {
    realtimeGlobal.__codemationRealtimeBridge__ = {
      retainWorkflowSubscription: null,
      listeners: new Set(),
    };
  }
  return realtimeGlobal.__codemationRealtimeBridge__;
}
