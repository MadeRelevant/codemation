import type { ChatLanguageModel, ChatModelConfig, StructuredOutputOptions, ZodSchemaAny } from "@codemation/core";
import { inject, injectable } from "@codemation/core";

import type { ModelMessage } from "ai";
import { ZodError } from "zod";

import { OpenAIChatModelFactory } from "../chatModels/OpenAIChatModelFactory";
import { OpenAiStrictJsonSchemaFactory } from "../chatModels/OpenAiStrictJsonSchemaFactory";
import { AgentStructuredOutputRepairPromptFactory } from "./AgentStructuredOutputRepairPromptFactory";
import { AgentMessageFactory } from "./AgentMessageFactory";

interface ParsedStructuredOutputSuccess<TValue> {
  readonly ok: true;
  readonly value: TValue;
}

interface ParsedStructuredOutputFailure {
  readonly ok: false;
  readonly invalidContent: string;
  readonly validationError: string;
}

type ParsedStructuredOutputResult<TValue> = ParsedStructuredOutputSuccess<TValue> | ParsedStructuredOutputFailure;

export type StructuredOutputSchemaForModel = ZodSchemaAny | Readonly<Record<string, unknown>>;

/**
 * Orchestrates a 2-attempt repair loop on top of `generateText({ output: Output.object(...) })`.
 *
 * Strategy:
 * 1. If the caller already has a raw final text (from a prior tool-calling turn), try parsing it
 *    directly against the schema — fast path for models that already emit strict JSON.
 * 2. Otherwise, run a native structured-output call via {@link invokeStructuredModel}. For the
 *    OpenAI-strict path, a {@link OpenAiStrictJsonSchemaFactory}-built JSON Schema record is
 *    handed to AI SDK's `jsonSchema(...)` wrapper (preserves `additionalProperties: false` at
 *    every object depth).
 * 3. If the structured call fails (AI_NoObjectGeneratedError / ZodError / schema reject), run a
 *    text-mode repair prompt with the validation error appended, up to 2 attempts.
 */
@injectable()
export class AgentStructuredOutputRunner {
  private static readonly repairAttemptCount = 2;
  private static readonly structuredOutputSchemaName = "agent_output";

  constructor(
    @inject(AgentStructuredOutputRepairPromptFactory)
    private readonly repairPromptFactory: AgentStructuredOutputRepairPromptFactory,
    @inject(OpenAiStrictJsonSchemaFactory)
    private readonly openAiStrictJsonSchemaFactory: OpenAiStrictJsonSchemaFactory,
  ) {}

  async resolve<TOutput>(
    args: Readonly<{
      model: ChatLanguageModel;
      chatModelConfig: ChatModelConfig;
      schema: ZodSchemaAny;
      conversation: ReadonlyArray<ModelMessage>;
      rawFinalText?: string;
      agentName: string;
      nodeId: string;
      invokeTextModel: (messages: ReadonlyArray<ModelMessage>) => Promise<{ text: string }>;
      invokeStructuredModel: (
        schema: StructuredOutputSchemaForModel,
        messages: ReadonlyArray<ModelMessage>,
        options: StructuredOutputOptions | undefined,
      ) => Promise<unknown>;
    }>,
  ): Promise<TOutput> {
    let lastFailure: ParsedStructuredOutputFailure | undefined;

    if (args.rawFinalText !== undefined) {
      const directResult = this.tryParseAndValidate<TOutput>(args.rawFinalText, args.schema);
      if (directResult.ok) {
        return directResult.value;
      }
      lastFailure = directResult;
    }

    try {
      const structuredOptions = this.resolveStructuredOutputOptions(args.chatModelConfig);
      const schemaForModel = this.resolveOutputSchemaForModel(args.schema, structuredOptions);
      const nativeResult = this.tryValidateStructuredValue<TOutput>(
        await args.invokeStructuredModel(schemaForModel, args.conversation, structuredOptions),
        args.schema,
      );
      if (nativeResult.ok) {
        return nativeResult.value;
      }
      lastFailure = nativeResult;
    } catch (error) {
      lastFailure = lastFailure ?? {
        ok: false,
        invalidContent: "",
        validationError: `Native structured output failed: ${this.summarizeError(error)}`,
      };
    }

    return await this.retryWithRepairPrompt<TOutput>({
      ...args,
      lastFailure:
        lastFailure ??
        ({
          ok: false,
          invalidContent: "",
          validationError: "Structured output was required but no valid structured response was produced.",
        } satisfies ParsedStructuredOutputFailure),
    });
  }

  private async retryWithRepairPrompt<TOutput>(
    args: Readonly<{
      schema: ZodSchemaAny;
      conversation: ReadonlyArray<ModelMessage>;
      lastFailure: ParsedStructuredOutputFailure;
      agentName: string;
      nodeId: string;
      invokeTextModel: (messages: ReadonlyArray<ModelMessage>) => Promise<{ text: string }>;
    }>,
  ): Promise<TOutput> {
    let failure = args.lastFailure;
    for (let attempt = 1; attempt <= AgentStructuredOutputRunner.repairAttemptCount; attempt++) {
      const repairMessages: ReadonlyArray<ModelMessage> = [
        ...args.conversation,
        ...AgentMessageFactory.createPromptMessages(
          this.repairPromptFactory.create({
            schema: args.schema,
            invalidContent: failure.invalidContent,
            validationError: failure.validationError,
          }),
        ),
      ];
      const repairResponse = await args.invokeTextModel(repairMessages);
      const repairResult = this.tryParseAndValidate<TOutput>(repairResponse.text, args.schema);
      if (repairResult.ok) {
        return repairResult.value;
      }
      failure = repairResult;
    }
    throw new Error(
      `Structured output required for AIAgent "${args.agentName}" (${args.nodeId}) but validation still failed after ${AgentStructuredOutputRunner.repairAttemptCount} repair attempts: ${failure.validationError}`,
    );
  }

  /**
   * Chooses strict mode for OpenAI chat-model configs, off otherwise.  Extendable in future for
   * other providers that adopt the same "supply a JSON Schema record directly" contract.
   */
  private resolveStructuredOutputOptions(chatModelConfig: ChatModelConfig): StructuredOutputOptions | undefined {
    if (chatModelConfig.type !== OpenAIChatModelFactory) {
      return undefined;
    }
    return { strict: true, schemaName: AgentStructuredOutputRunner.structuredOutputSchemaName };
  }

  private resolveOutputSchemaForModel(
    schema: ZodSchemaAny,
    options: StructuredOutputOptions | undefined,
  ): StructuredOutputSchemaForModel {
    if (!options?.strict) {
      return schema;
    }
    return this.openAiStrictJsonSchemaFactory.createStructuredOutputRecord(schema, {
      schemaName: options.schemaName ?? AgentStructuredOutputRunner.structuredOutputSchemaName,
    });
  }

  private tryParseAndValidate<TOutput>(content: string, schema: ZodSchemaAny): ParsedStructuredOutputResult<TOutput> {
    try {
      return this.tryValidateStructuredValue<TOutput>(JSON.parse(content) as unknown, schema, content);
    } catch (error) {
      return {
        ok: false,
        invalidContent: content,
        validationError: `Response was not valid JSON: ${this.summarizeError(error)}`,
      };
    }
  }

  private tryValidateStructuredValue<TOutput>(
    value: unknown,
    schema: ZodSchemaAny,
    invalidContent?: string,
  ): ParsedStructuredOutputResult<TOutput> {
    try {
      return {
        ok: true,
        value: schema.parse(value) as TOutput,
      };
    } catch (error) {
      return {
        ok: false,
        invalidContent: invalidContent ?? this.toJson(value),
        validationError: this.summarizeError(error),
      };
    }
  }

  private summarizeError(error: unknown): string {
    if (error instanceof ZodError) {
      return error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`).join("; ");
    }
    if (error instanceof Error) {
      return error.message;
    }
    return String(error);
  }

  private toJson(value: unknown): string {
    try {
      const serialized = JSON.stringify(value);
      return serialized ?? String(value);
    } catch (error) {
      return `<<unserializable: ${this.summarizeError(error)}>>`;
    }
  }
}
