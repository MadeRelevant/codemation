import type { AgentMessageDto, ZodSchemaAny } from "@codemation/core";
import { inject, injectable } from "@codemation/core";

import { AIAgentExecutionHelpersFactory } from "./AIAgentExecutionHelpersFactory";

@injectable()
export class AgentStructuredOutputRepairPromptFactory {
  private static readonly maxSchemaLength = 8000;
  private static readonly maxInvalidContentLength = 4000;
  private static readonly maxValidationErrorLength = 4000;

  constructor(
    @inject(AIAgentExecutionHelpersFactory)
    private readonly executionHelpers: AIAgentExecutionHelpersFactory,
  ) {}

  create(
    args: Readonly<{
      schema: ZodSchemaAny;
      invalidContent: string;
      validationError: string;
    }>,
  ): ReadonlyArray<AgentMessageDto> {
    return [
      {
        role: "system",
        content:
          "Return only JSON that matches the required schema exactly. Do not include markdown fences, commentary, or prose.",
      },
      {
        role: "user",
        content: JSON.stringify({
          requiredSchema: this.truncate(
            JSON.stringify(
              this.executionHelpers.createJsonSchemaRecord(args.schema, {
                schemaName: "agent_output",
                requireObjectRoot: false,
              }),
            ),
            AgentStructuredOutputRepairPromptFactory.maxSchemaLength,
          ),
          invalidModelOutput: this.truncate(
            args.invalidContent,
            AgentStructuredOutputRepairPromptFactory.maxInvalidContentLength,
          ),
          validationError: this.truncate(
            args.validationError,
            AgentStructuredOutputRepairPromptFactory.maxValidationErrorLength,
          ),
        }),
      },
    ];
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength)}...(truncated)`;
  }
}
