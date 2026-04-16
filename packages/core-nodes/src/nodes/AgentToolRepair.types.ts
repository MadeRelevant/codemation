import type { JsonValue } from "@codemation/core";

export type AgentToolFailureKind = "repairable_validation_error" | "transient_execution_error" | "non_repairable_error";

export type AgentToolRepairNextAction = "model_retry_with_tool_error_message" | "fail_agent_run";

export interface AgentToolValidationIssue {
  readonly path: ReadonlyArray<string | number>;
  readonly code: string;
  readonly message: string;
  readonly expected?: string;
  readonly received?: string;
}

export interface AgentToolRepairDecision {
  readonly attempt: number;
  readonly maxAttempts: number;
  readonly nextAction: AgentToolRepairNextAction;
}

export interface AgentToolFailureClassification {
  readonly kind: AgentToolFailureKind;
  readonly effectiveError: Error;
  readonly issues?: ReadonlyArray<AgentToolValidationIssue>;
  readonly requiredSchemaReminder?: JsonValue;
}
