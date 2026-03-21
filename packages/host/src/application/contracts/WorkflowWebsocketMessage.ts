import type { RunEvent } from "@codemation/core";

export type WorkflowWebsocketMessage =
  | Readonly<{ kind: "event"; event: RunEvent }>
  | Readonly<{ kind: "workflowChanged"; workflowId: string }>
  | Readonly<{ kind: "devBuildStarted"; workflowId: string; buildVersion?: string }>
  | Readonly<{ kind: "devBuildCompleted"; workflowId: string; buildVersion: string }>
  | Readonly<{ kind: "devBuildFailed"; workflowId: string; message: string }>;
