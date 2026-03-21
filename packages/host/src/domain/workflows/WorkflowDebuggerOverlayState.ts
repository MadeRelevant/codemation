import type { RunCurrentState } from "@codemation/core";

export type WorkflowDebuggerOverlayState = Readonly<{
  workflowId: string;
  updatedAt: string;
  copiedFromRunId?: string;
  currentState: RunCurrentState;
}>;
