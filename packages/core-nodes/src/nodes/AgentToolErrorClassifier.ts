import type { JsonValue } from "@codemation/core";
import { injectable } from "@codemation/core";
import { ZodError } from "zod";

import type { AgentToolFailureClassification, AgentToolValidationIssue } from "./AgentToolRepair.types";

@injectable()
export class AgentToolErrorClassifier {
  classify(
    args: Readonly<{
      error: unknown;
      toolName: string;
      schema?: unknown;
    }>,
  ): AgentToolFailureClassification {
    const effectiveError = this.toError(args.error);
    if (this.isRepairableValidationError(args.error, effectiveError)) {
      return {
        kind: "repairable_validation_error",
        effectiveError,
        issues: this.extractIssues(args.error, effectiveError, args.toolName),
        requiredSchemaReminder: this.toJsonValue(args.schema),
      };
    }
    if (this.isTransientExecutionError(effectiveError)) {
      return {
        kind: "transient_execution_error",
        effectiveError,
      };
    }
    return {
      kind: "non_repairable_error",
      effectiveError,
    };
  }

  private isRepairableValidationError(rawError: unknown, effectiveError: Error): boolean {
    if (rawError instanceof ZodError) {
      const stage = (rawError as ZodError & { codemationToolValidationStage?: "input" | "output" })
        .codemationToolValidationStage;
      return stage !== "output";
    }
    if (effectiveError.name === "ZodError") {
      return true;
    }
    return effectiveError.message.includes("Received tool input did not match expected schema");
  }

  private extractIssues(
    rawError: unknown,
    effectiveError: Error,
    toolName: string,
  ): ReadonlyArray<AgentToolValidationIssue> | undefined {
    if (rawError instanceof ZodError) {
      return rawError.issues.map((issue) => ({
        path: issue.path.map((segment) => (typeof segment === "number" ? segment : String(segment))),
        code: issue.code,
        message: issue.message,
        expected: this.toOptionalString("expected" in issue ? issue.expected : undefined),
        received: this.toOptionalString("received" in issue ? issue.received : undefined),
      }));
    }
    if (effectiveError.name !== "ZodError") {
      return undefined;
    }
    return [
      {
        path: [],
        code: "invalid_tool_input",
        message: `Tool "${toolName}" input was invalid: ${effectiveError.message}`,
      },
    ];
  }

  private isTransientExecutionError(error: Error): boolean {
    const summary = `${error.name} ${error.message}`.toLowerCase();
    return (
      summary.includes("timeout") ||
      summary.includes("timed out") ||
      summary.includes("rate limit") ||
      summary.includes("too many requests") ||
      summary.includes("temporarily unavailable") ||
      summary.includes("econnreset") ||
      summary.includes("etimedout") ||
      summary.includes("503")
    );
  }

  private toError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }

  private toJsonValue(value: unknown): JsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  }

  private toOptionalString(value: unknown): string | undefined {
    if (value === undefined) {
      return undefined;
    }
    return String(value);
  }
}
