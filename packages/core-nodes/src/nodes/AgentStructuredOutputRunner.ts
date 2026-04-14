import type {
  ChatModelConfig,
  ChatModelStructuredOutputOptions,
  LangChainChatModelLike,
  LangChainStructuredOutputModelLike,
  ZodSchemaAny,
} from "@codemation/core";
import { inject, injectable } from "@codemation/core";

import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { ZodError } from "zod";

import { OpenAIStructuredOutputMethodFactory } from "../chatModels/OpenAIStructuredOutputMethodFactory";
import { AgentMessageFactory } from "./AgentMessageFactory";
import { AgentStructuredOutputRepairPromptFactory } from "./AgentStructuredOutputRepairPromptFactory";

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

@injectable()
export class AgentStructuredOutputRunner {
  private static readonly repairAttemptCount = 2;

  constructor(
    @inject(AgentStructuredOutputRepairPromptFactory)
    private readonly repairPromptFactory: AgentStructuredOutputRepairPromptFactory,
    @inject(OpenAIStructuredOutputMethodFactory)
    private readonly openAiStructuredOutputMethodFactory: OpenAIStructuredOutputMethodFactory,
  ) {}

  async resolve<TOutput>(
    args: Readonly<{
      model: LangChainChatModelLike;
      chatModelConfig: ChatModelConfig;
      schema: ZodSchemaAny;
      conversation: ReadonlyArray<BaseMessage>;
      rawFinalResponse?: AIMessage;
      agentName: string;
      nodeId: string;
      invokeTextModel: (messages: ReadonlyArray<BaseMessage>) => Promise<AIMessage>;
      invokeStructuredModel: (
        model: LangChainStructuredOutputModelLike,
        messages: ReadonlyArray<BaseMessage>,
      ) => Promise<unknown>;
    }>,
  ): Promise<TOutput> {
    let lastFailure: ParsedStructuredOutputFailure | undefined;

    if (args.rawFinalResponse) {
      const directResult = this.tryParseAndValidate<TOutput>(
        AgentMessageFactory.extractContent(args.rawFinalResponse),
        args.schema,
      );
      if (directResult.ok) {
        return directResult.value;
      }
      lastFailure = directResult;
    } else if (!this.supportsNativeStructuredOutput(args.model)) {
      const rawResponse = await args.invokeTextModel(args.conversation);
      const directResult = this.tryParseAndValidate<TOutput>(
        AgentMessageFactory.extractContent(rawResponse),
        args.schema,
      );
      if (directResult.ok) {
        return directResult.value;
      }
      lastFailure = directResult;
    }

    try {
      const nativeStructuredModel = this.createStructuredOutputModel(args.model, args.chatModelConfig, args.schema);
      if (nativeStructuredModel) {
        const nativeResult = this.tryValidateStructuredValue<TOutput>(
          await args.invokeStructuredModel(nativeStructuredModel, args.conversation),
          args.schema,
        );
        if (nativeResult.ok) {
          return nativeResult.value;
        }
        lastFailure = nativeResult;
      }
    } catch (error) {
      lastFailure = {
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
      conversation: ReadonlyArray<BaseMessage>;
      lastFailure: ParsedStructuredOutputFailure;
      agentName: string;
      nodeId: string;
      invokeTextModel: (messages: ReadonlyArray<BaseMessage>) => Promise<AIMessage>;
    }>,
  ): Promise<TOutput> {
    let failure = args.lastFailure;
    for (let attempt = 1; attempt <= AgentStructuredOutputRunner.repairAttemptCount; attempt++) {
      const repairMessages = [
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
      const repairResult = this.tryParseAndValidate<TOutput>(
        AgentMessageFactory.extractContent(repairResponse),
        args.schema,
      );
      if (repairResult.ok) {
        return repairResult.value;
      }
      failure = repairResult;
    }
    throw new Error(
      `Structured output required for AIAgent "${args.agentName}" (${args.nodeId}) but validation still failed after ${AgentStructuredOutputRunner.repairAttemptCount} repair attempts: ${failure.validationError}`,
    );
  }

  private createStructuredOutputModel(
    model: LangChainChatModelLike,
    chatModelConfig: ChatModelConfig,
    schema: ZodSchemaAny,
  ): LangChainStructuredOutputModelLike | undefined {
    if (!this.supportsNativeStructuredOutput(model)) {
      return undefined;
    }
    const options = this.getStructuredOutputOptions(chatModelConfig);
    return model.withStructuredOutput(schema, options);
  }

  private getStructuredOutputOptions(chatModelConfig: ChatModelConfig): ChatModelStructuredOutputOptions | undefined {
    return this.openAiStructuredOutputMethodFactory.create(chatModelConfig) ?? { strict: true };
  }

  private supportsNativeStructuredOutput(model: LangChainChatModelLike): model is LangChainChatModelLike & {
    withStructuredOutput: (
      outputSchema: ZodSchemaAny,
      config?: ChatModelStructuredOutputOptions,
    ) => LangChainStructuredOutputModelLike;
  } {
    return typeof model.withStructuredOutput === "function";
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
      return JSON.stringify(value);
    } catch (error) {
      return `<<unserializable: ${this.summarizeError(error)}>>`;
    }
  }
}
