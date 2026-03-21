import type { RunCurrentState } from "@codemation/core";
import type { WorkflowDebuggerOverlayState } from "../../domain/workflows/WorkflowDebuggerOverlayState";

export type UpdateWorkflowDebuggerOverlayRequest = Readonly<{
  currentState?: RunCurrentState;
}>;

export type CopyRunToWorkflowDebuggerRequest = Readonly<{
  sourceRunId?: string;
}>;

export type WorkflowDebuggerOverlayResponse = WorkflowDebuggerOverlayState;
