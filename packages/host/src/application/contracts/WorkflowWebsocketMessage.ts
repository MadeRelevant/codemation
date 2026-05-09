import type { RunEvent } from "@codemation/core";
import type { TelemetrySpanUpsert } from "../../domain/telemetry/TelemetryContracts";

export type WorkflowWebsocketMessage =
  | Readonly<{ kind: "event"; event: RunEvent }>
  | Readonly<{ kind: "workflowChanged"; workflowId: string }>
  | Readonly<{ kind: "devBuildStarted"; workflowId: string; buildVersion?: string }>
  | Readonly<{ kind: "devBuildCompleted"; workflowId: string; buildVersion: string }>
  | Readonly<{ kind: "devBuildFailed"; workflowId: string; message: string }>
  | Readonly<{ kind: "telemetryEvent"; runId: string; span: TelemetrySpanUpsert }>;
