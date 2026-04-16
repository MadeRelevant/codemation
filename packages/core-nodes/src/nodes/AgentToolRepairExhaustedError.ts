import type { JsonValue } from "@codemation/core";

import type { AgentToolValidationIssue } from "./AgentToolRepair.types";

export class AgentToolRepairExhaustedError extends Error {
  readonly details: JsonValue;

  constructor(
    args: Readonly<{
      agentName: string;
      nodeId: string;
      toolName: string;
      maxAttempts: number;
      lastManagedInput?: JsonValue;
      lastValidationIssues?: ReadonlyArray<AgentToolValidationIssue>;
    }>,
  ) {
    super(
      `AIAgent "${args.agentName}" (${args.nodeId}) could not recover from invalid tool calls for "${args.toolName}" after ${args.maxAttempts} repair attempt(s).`,
    );
    this.name = "AgentToolRepairExhaustedError";
    const details: Record<string, JsonValue> = {
      toolName: args.toolName,
      maxAttempts: args.maxAttempts,
      recommendation:
        "Check tool schema, tool description, or inject known values in code instead of asking the model to infer them.",
    };
    if (args.lastManagedInput !== undefined) {
      details["lastManagedInput"] = args.lastManagedInput;
    }
    if (args.lastValidationIssues && args.lastValidationIssues.length > 0) {
      details["lastValidationIssues"] = args.lastValidationIssues.map((issue) => this.serializeIssue(issue));
    }
    this.details = details;
  }

  private serializeIssue(issue: AgentToolValidationIssue): JsonValue {
    const result: Record<string, JsonValue> = {
      path: [...issue.path],
      code: issue.code,
      message: issue.message,
    };
    if (issue.expected !== undefined) {
      result["expected"] = issue.expected;
    }
    if (issue.received !== undefined) {
      result["received"] = issue.received;
    }
    return result;
  }
}
