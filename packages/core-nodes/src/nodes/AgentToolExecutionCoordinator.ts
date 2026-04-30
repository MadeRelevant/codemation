import type { JsonValue, NodeExecutionContext } from "@codemation/core";
import { CodemationTelemetryAttributeNames, inject, injectable } from "@codemation/core";

import type { AIAgent } from "./AIAgentConfig";
import { AgentOutputFactory } from "./AgentOutputFactory";
import { AgentToolCallPortMap } from "./AgentToolCallPortMapFactory";
import { AgentToolErrorClassifier } from "./AgentToolErrorClassifier";
import { AgentToolRepairExhaustedError } from "./AgentToolRepairExhaustedError";
import { AgentToolRepairPolicy } from "./AgentToolRepairPolicy";
import type { AgentToolRepairDecision, AgentToolValidationIssue } from "./AgentToolRepair.types";
import type { ExecutedToolCall, PlannedToolCall } from "./aiAgentSupport.types";

@injectable()
export class AgentToolExecutionCoordinator {
  constructor(
    @inject(AgentToolErrorClassifier)
    private readonly errorClassifier: AgentToolErrorClassifier,
    @inject(AgentToolRepairPolicy)
    private readonly repairPolicy: AgentToolRepairPolicy,
  ) {}

  async execute(
    args: Readonly<{
      plannedToolCalls: ReadonlyArray<PlannedToolCall>;
      ctx: NodeExecutionContext<AIAgent<any, any>>;
      agentName: string;
      repairAttemptsByToolName: Map<string, number>;
    }>,
  ): Promise<ReadonlyArray<ExecutedToolCall>> {
    const results = await Promise.allSettled(
      args.plannedToolCalls.map(
        async (plannedToolCall) => await this.executePlannedToolCall({ ...args, plannedToolCall }),
      ),
    );

    const rejected = results.find((result) => result.status === "rejected");
    if (rejected?.status === "rejected") {
      throw rejected.reason instanceof Error ? rejected.reason : new Error(String(rejected.reason));
    }

    return results
      .filter((result): result is PromiseFulfilledResult<ExecutedToolCall> => result.status === "fulfilled")
      .map((result) => result.value);
  }

  private async executePlannedToolCall(
    args: Readonly<{
      plannedToolCall: PlannedToolCall;
      ctx: NodeExecutionContext<AIAgent<any, any>>;
      agentName: string;
      repairAttemptsByToolName: Map<string, number>;
    }>,
  ): Promise<ExecutedToolCall> {
    const { plannedToolCall, ctx } = args;
    const toolCallInputsByPort = AgentToolCallPortMap.fromInput(plannedToolCall.toolCall.input ?? {});
    const invocationId = plannedToolCall.invocationId;
    const startedAt = new Date();
    const span = ctx.telemetry.startChildSpan({
      name: "agent.tool.call",
      kind: "client",
      startedAt,
      attributes: {
        [CodemationTelemetryAttributeNames.connectionInvocationId]: invocationId,
        [CodemationTelemetryAttributeNames.toolName]: plannedToolCall.binding.config.name,
        ...(ctx.iterationId ? { [CodemationTelemetryAttributeNames.iterationId]: ctx.iterationId } : {}),
        ...(typeof ctx.itemIndex === "number"
          ? { [CodemationTelemetryAttributeNames.iterationIndex]: ctx.itemIndex }
          : {}),
        ...(ctx.parentInvocationId
          ? { [CodemationTelemetryAttributeNames.parentInvocationId]: ctx.parentInvocationId }
          : {}),
      },
    });
    await ctx.nodeState?.markRunning({
      nodeId: plannedToolCall.nodeId,
      activationId: ctx.activationId,
      inputsByPort: toolCallInputsByPort,
    });
    await ctx.nodeState?.appendConnectionInvocation({
      invocationId,
      connectionNodeId: plannedToolCall.nodeId,
      parentAgentNodeId: ctx.nodeId,
      parentAgentActivationId: ctx.activationId,
      status: "running",
      managedInput: this.toJsonValue(plannedToolCall.toolCall.input),
      queuedAt: startedAt.toISOString(),
      startedAt: startedAt.toISOString(),
      iterationId: ctx.iterationId,
      parentInvocationId: ctx.parentInvocationId,
    });

    try {
      const result = await plannedToolCall.binding.execute(plannedToolCall.toolCall.input ?? {}, {
        parentSpan: span,
        parentInvocationId: invocationId,
      });
      const serialized = typeof result === "string" ? result : JSON.stringify(result);
      const finishedAt = new Date();
      await ctx.nodeState?.markCompleted({
        nodeId: plannedToolCall.nodeId,
        activationId: ctx.activationId,
        inputsByPort: toolCallInputsByPort,
        outputs: AgentOutputFactory.fromUnknown(result),
      });
      await span.attachArtifact({
        kind: "tool.input",
        contentType: "application/json",
        previewJson: this.toJsonValue(plannedToolCall.toolCall.input),
      });
      await span.attachArtifact({
        kind: "tool.output",
        contentType: "application/json",
        previewJson: this.toJsonValue(result),
      });
      await span.end({ status: "ok", endedAt: finishedAt });
      await ctx.nodeState?.appendConnectionInvocation({
        invocationId,
        connectionNodeId: plannedToolCall.nodeId,
        parentAgentNodeId: ctx.nodeId,
        parentAgentActivationId: ctx.activationId,
        status: "completed",
        managedInput: this.toJsonValue(plannedToolCall.toolCall.input),
        managedOutput: this.toJsonValue(result),
        queuedAt: startedAt.toISOString(),
        startedAt: startedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        iterationId: ctx.iterationId,
        parentInvocationId: ctx.parentInvocationId,
      });
      return {
        toolName: plannedToolCall.binding.config.name,
        toolCallId: plannedToolCall.toolCall.id ?? plannedToolCall.binding.config.name,
        serialized: typeof serialized === "string" ? serialized : JSON.stringify(serialized),
        result,
      } satisfies ExecutedToolCall;
    } catch (error) {
      const classification = this.errorClassifier.classify({
        error,
        toolName: plannedToolCall.binding.config.name,
        schema: plannedToolCall.binding.inputSchema,
      });

      if (classification.kind !== "repairable_validation_error") {
        const effectiveError = classification.effectiveError;
        await this.recordFailedInvocation({
          invocationId,
          plannedToolCall,
          ctx,
          startedAt,
          inputsByPort: toolCallInputsByPort,
          managedInput: this.toJsonValue(plannedToolCall.toolCall.input),
          error: effectiveError,
        });
        await span.attachArtifact({
          kind: "tool.input",
          contentType: "application/json",
          previewJson: this.toJsonValue(plannedToolCall.toolCall.input),
        });
        await span.end({
          status: "error",
          statusMessage: effectiveError.message,
          endedAt: new Date(),
        });
        throw effectiveError;
      }

      const repairDecision = this.repairPolicy.createDecision(
        plannedToolCall.binding.config.name,
        args.repairAttemptsByToolName,
      );

      if (repairDecision.nextAction === "fail_agent_run") {
        const exhaustedError = new AgentToolRepairExhaustedError({
          agentName: args.agentName,
          nodeId: ctx.nodeId,
          toolName: plannedToolCall.binding.config.name,
          maxAttempts: repairDecision.maxAttempts,
          lastManagedInput: this.toJsonValue(plannedToolCall.toolCall.input),
          lastValidationIssues: classification.issues,
        });
        await this.recordFailedInvocation({
          invocationId,
          plannedToolCall,
          ctx,
          startedAt,
          inputsByPort: toolCallInputsByPort,
          managedInput: this.toJsonValue(plannedToolCall.toolCall.input),
          error: exhaustedError,
          errorDetails: exhaustedError.details,
        });
        await span.attachArtifact({
          kind: "tool.input",
          contentType: "application/json",
          previewJson: this.toJsonValue(plannedToolCall.toolCall.input),
        });
        await span.attachArtifact({
          kind: "tool.error",
          contentType: "application/json",
          previewJson: exhaustedError.details,
        });
        await span.end({
          status: "error",
          statusMessage: exhaustedError.message,
          endedAt: new Date(),
        });
        throw exhaustedError;
      }

      const repairPayload = this.createRepairPayload({
        toolName: plannedToolCall.binding.config.name,
        issues: classification.issues,
        requiredSchemaReminder: classification.requiredSchemaReminder,
      });
      const repairDetails = this.createRepairDetails({
        toolName: plannedToolCall.binding.config.name,
        issues: classification.issues,
        requiredSchemaReminder: classification.requiredSchemaReminder,
        repairDecision,
      });
      await this.recordFailedInvocation({
        invocationId,
        plannedToolCall,
        ctx,
        startedAt,
        inputsByPort: toolCallInputsByPort,
        managedInput: this.toJsonValue(plannedToolCall.toolCall.input),
        error: classification.effectiveError,
        errorDetails: repairDetails,
      });
      await span.attachArtifact({
        kind: "tool.input",
        contentType: "application/json",
        previewJson: this.toJsonValue(plannedToolCall.toolCall.input),
      });
      await span.attachArtifact({
        kind: "tool.error",
        contentType: "application/json",
        previewJson: repairPayload,
      });
      await span.end({
        status: "error",
        statusMessage: classification.effectiveError.message,
        endedAt: new Date(),
      });
      return {
        toolName: plannedToolCall.binding.config.name,
        toolCallId: plannedToolCall.toolCall.id ?? plannedToolCall.binding.config.name,
        serialized: JSON.stringify(repairPayload),
        result: repairPayload,
      } satisfies ExecutedToolCall;
    }
  }

  private async recordFailedInvocation(
    args: Readonly<{
      invocationId: string;
      plannedToolCall: PlannedToolCall;
      ctx: NodeExecutionContext<AIAgent<any, any>>;
      startedAt: Date;
      inputsByPort: ReturnType<typeof AgentToolCallPortMap.fromInput>;
      managedInput?: JsonValue;
      error: Error;
      errorDetails?: JsonValue;
    }>,
  ): Promise<void> {
    const finishedAt = new Date();
    await args.ctx.nodeState?.markFailed({
      nodeId: args.plannedToolCall.nodeId,
      activationId: args.ctx.activationId,
      inputsByPort: args.inputsByPort,
      error: args.error,
    });
    await args.ctx.nodeState?.appendConnectionInvocation({
      invocationId: args.invocationId,
      connectionNodeId: args.plannedToolCall.nodeId,
      parentAgentNodeId: args.ctx.nodeId,
      parentAgentActivationId: args.ctx.activationId,
      status: "failed",
      managedInput: args.managedInput,
      error: {
        message: args.error.message,
        name: args.error.name,
        stack: args.error.stack,
        details: args.errorDetails ?? this.extractErrorDetails(args.error),
      },
      queuedAt: args.startedAt.toISOString(),
      startedAt: args.startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      iterationId: args.ctx.iterationId,
      parentInvocationId: args.ctx.parentInvocationId,
    });
  }

  private createRepairPayload(
    args: Readonly<{
      toolName: string;
      issues?: ReadonlyArray<AgentToolValidationIssue>;
      requiredSchemaReminder?: JsonValue;
    }>,
  ): JsonValue {
    const payload: Record<string, JsonValue> = {
      status: "error",
      errorType: "validation",
      toolName: args.toolName,
      message: this.createValidationMessage(args.toolName, args.issues),
      instruction: "Call the tool again with all required fields present and correctly typed.",
    };
    if (args.requiredSchemaReminder !== undefined) {
      payload["requiredSchemaReminder"] = args.requiredSchemaReminder;
    }
    return payload;
  }

  private createRepairDetails(
    args: Readonly<{
      toolName: string;
      issues?: ReadonlyArray<AgentToolValidationIssue>;
      requiredSchemaReminder?: JsonValue;
      repairDecision: AgentToolRepairDecision;
    }>,
  ): JsonValue {
    const details: Record<string, JsonValue> = {
      errorType: "validation",
      toolName: args.toolName,
      recoveryHint: "Call the same tool again with every required field present and correctly typed.",
      repair: {
        attempt: args.repairDecision.attempt,
        maxAttempts: args.repairDecision.maxAttempts,
        nextAction: args.repairDecision.nextAction,
      },
    };
    if (args.issues && args.issues.length > 0) {
      details["issues"] = args.issues.map((issue) => this.serializeIssue(issue));
    }
    if (args.requiredSchemaReminder !== undefined) {
      details["requiredSchemaReminder"] = args.requiredSchemaReminder;
    }
    return details;
  }

  private createValidationMessage(
    toolName: string,
    issues: ReadonlyArray<AgentToolValidationIssue> | undefined,
  ): string {
    const firstIssue = issues?.[0];
    if (!firstIssue) {
      return `Your previous tool call for "${toolName}" was invalid and did not match the expected schema.`;
    }
    const fieldPath = firstIssue.path.length > 0 ? firstIssue.path.join(".") : "<root>";
    return `Your previous tool call for "${toolName}" was invalid because field "${fieldPath}" failed validation: ${firstIssue.message}`;
  }

  private toJsonValue(value: unknown): JsonValue | undefined {
    if (value === undefined) {
      return undefined;
    }
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  }

  private extractErrorDetails(error: Error): JsonValue | undefined {
    const candidate = error as Error & { details?: JsonValue };
    return candidate.details;
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
