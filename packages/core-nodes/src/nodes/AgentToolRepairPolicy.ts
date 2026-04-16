import { injectable } from "@codemation/core";

import type { AgentToolRepairDecision } from "./AgentToolRepair.types";

@injectable()
export class AgentToolRepairPolicy {
  private static readonly maxRepairAttemptsPerTool = 2;

  createDecision(toolName: string, attemptsByToolName: Map<string, number>): AgentToolRepairDecision {
    const attempt = (attemptsByToolName.get(toolName) ?? 0) + 1;
    attemptsByToolName.set(toolName, attempt);
    return {
      attempt,
      maxAttempts: AgentToolRepairPolicy.maxRepairAttemptsPerTool,
      nextAction:
        attempt < AgentToolRepairPolicy.maxRepairAttemptsPerTool
          ? "model_retry_with_tool_error_message"
          : "fail_agent_run",
    };
  }
}
