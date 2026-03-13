import type { RunEvent } from "@codemation/core";

export type WorkflowWebsocketMessage =
  | Readonly<{ kind: "event"; event: RunEvent }>
  | Readonly<{ kind: "workflowChanged"; workflowId: string }>;
