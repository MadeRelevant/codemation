import type { WorkflowDefinition } from "@codemation/core";
import type { RealtimeRuntimeDiagnostics } from "../realtimeRuntimeFactory";

export interface StartupSummaryLogger {
  info(message: string): void;
}

export interface FrontendStartupSummaryArgs {
  processLabel: string;
  runtime: RealtimeRuntimeDiagnostics;
  websocketHost: string;
  websocketPort: number;
  workflowDefinitions: ReadonlyArray<WorkflowDefinition>;
  triggerStatusLabel: string;
  bootstrapSource: string | null;
  workflowSources: ReadonlyArray<string>;
}

export interface WorkerStartupSummaryArgs {
  processLabel: string;
  runtime: RealtimeRuntimeDiagnostics;
  workflowDefinitions: ReadonlyArray<WorkflowDefinition>;
  queues: ReadonlyArray<string>;
  bootstrapSource: string | null;
  workflowSources: ReadonlyArray<string>;
}
