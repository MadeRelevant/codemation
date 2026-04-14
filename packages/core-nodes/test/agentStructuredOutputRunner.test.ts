import type { ChatModelConfig, LangChainChatModelLike, LangChainStructuredOutputModelLike } from "@codemation/core";
import { AIMessage, HumanMessage, type BaseMessage } from "@langchain/core/messages";
import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import { OpenAIStructuredOutputMethodFactory } from "../src/chatModels/OpenAIStructuredOutputMethodFactory";
import { OpenAIChatModelConfig } from "../src/chatModels/openAiChatModelConfig";
import { AIAgentExecutionHelpersFactory } from "../src/nodes/AIAgentExecutionHelpersFactory";
import { AgentStructuredOutputRepairPromptFactory } from "../src/nodes/AgentStructuredOutputRepairPromptFactory";
import { AgentStructuredOutputRunner } from "../src/nodes/AgentStructuredOutputRunner";

class StructuredOutputFixtureFactory {
  static readonly schema = z.object({
    outcome: z.enum(["rfq", "other"]),
    summary: z.string(),
  });

  static createValidOutput(
    overrides?: Partial<z.output<typeof StructuredOutputFixtureFactory.schema>>,
  ): z.output<typeof StructuredOutputFixtureFactory.schema> {
    return {
      outcome: "rfq",
      summary: "RFQ detected",
      ...overrides,
    };
  }
}

class MessageInspection {
  static contents(messages: ReadonlyArray<BaseMessage>): ReadonlyArray<string> {
    return messages.map((message) => {
      if (typeof message.content === "string") {
        return message.content;
      }
      return JSON.stringify(message.content);
    });
  }
}

class StructuredOutputRunnerCapture {
  readonly textMessages: BaseMessage[][] = [];
  readonly structuredMessages: BaseMessage[][] = [];
  readonly structuredBindings: Array<Readonly<{ outputSchema: unknown; config: unknown }>> = [];

  recordTextMessages(messages: ReadonlyArray<BaseMessage>): void {
    this.textMessages.push([...messages]);
  }

  recordStructuredMessages(messages: ReadonlyArray<BaseMessage>): void {
    this.structuredMessages.push([...messages]);
  }

  recordStructuredBinding(outputSchema: unknown, config: unknown): void {
    this.structuredBindings.push({ outputSchema, config });
  }
}

class PlainChatModelConfig implements ChatModelConfig {
  readonly type = PlainChatModelFactory;

  constructor(public readonly name: string) {}
}

class PlainChatModelFactory {}

class PlainChatModel implements LangChainChatModelLike {
  async invoke(): Promise<unknown> {
    return new AIMessage({ content: "unused" });
  }
}

class StructuredChatModel implements LangChainChatModelLike {
  constructor(
    private readonly capture: StructuredOutputRunnerCapture,
    private readonly structuredResponses: ReadonlyArray<unknown>,
  ) {}

  async invoke(): Promise<unknown> {
    return new AIMessage({ content: "unused" });
  }

  withStructuredOutput(outputSchema: unknown, config?: unknown): LangChainStructuredOutputModelLike {
    this.capture.recordStructuredBinding(outputSchema, config);
    return new StructuredRunnable(this.capture, this.structuredResponses);
  }
}

class StructuredRunnable implements LangChainStructuredOutputModelLike {
  private invocationCount = 0;

  constructor(
    private readonly capture: StructuredOutputRunnerCapture,
    private readonly responses: ReadonlyArray<unknown>,
  ) {}

  async invoke(messages: unknown): Promise<unknown> {
    this.capture.recordStructuredMessages(messages as ReadonlyArray<BaseMessage>);
    const response = this.responses[this.invocationCount] ?? this.responses[this.responses.length - 1];
    this.invocationCount += 1;
    if (response instanceof Error) {
      throw response;
    }
    return response;
  }
}

class AgentStructuredOutputRunnerTestRig {
  readonly capture = new StructuredOutputRunnerCapture();
  readonly runner = new AgentStructuredOutputRunner(
    new AgentStructuredOutputRepairPromptFactory(new AIAgentExecutionHelpersFactory()),
    new OpenAIStructuredOutputMethodFactory(),
  );

  createConversation(): ReadonlyArray<BaseMessage> {
    return [new HumanMessage({ content: "Classify this mail." })];
  }

  createPlainModel(): LangChainChatModelLike {
    return new PlainChatModel();
  }

  createStructuredModel(structuredResponses: ReadonlyArray<unknown>): LangChainChatModelLike {
    return new StructuredChatModel(this.capture, structuredResponses);
  }

  createTextInvoker(responses: ReadonlyArray<string>): (messages: ReadonlyArray<BaseMessage>) => Promise<AIMessage> {
    let invocationCount = 0;
    return async (messages) => {
      this.capture.recordTextMessages(messages);
      const response = responses[invocationCount] ?? responses[responses.length - 1] ?? "";
      invocationCount += 1;
      return new AIMessage({ content: response });
    };
  }

  createStructuredInvoker(): (
    model: LangChainStructuredOutputModelLike,
    messages: ReadonlyArray<BaseMessage>,
  ) => Promise<unknown> {
    return async (model, messages) => await model.invoke(messages);
  }
}

test("AgentStructuredOutputRunner returns validated raw final output without additional retries", async () => {
  const rig = new AgentStructuredOutputRunnerTestRig();
  const expected = StructuredOutputFixtureFactory.createValidOutput({ summary: "Final response already valid" });

  const result = await rig.runner.resolve({
    model: rig.createPlainModel(),
    chatModelConfig: new PlainChatModelConfig("Plain model"),
    schema: StructuredOutputFixtureFactory.schema,
    conversation: rig.createConversation(),
    rawFinalResponse: new AIMessage({ content: JSON.stringify(expected) }),
    agentName: "Structured raw success",
    nodeId: "agent_raw_success",
    invokeTextModel: rig.createTextInvoker([]),
    invokeStructuredModel: rig.createStructuredInvoker(),
  });

  assert.deepEqual(result, expected);
  assert.equal(rig.capture.textMessages.length, 0);
  assert.equal(rig.capture.structuredMessages.length, 0);
});

test("AgentStructuredOutputRunner uses native structured output with jsonSchema only for supported OpenAI snapshots", async () => {
  const rig = new AgentStructuredOutputRunnerTestRig();
  const expected = StructuredOutputFixtureFactory.createValidOutput({ summary: "Native structured result" });

  const result = await rig.runner.resolve({
    model: rig.createStructuredModel([expected]),
    chatModelConfig: new OpenAIChatModelConfig("OpenAI", "gpt-4o-2024-08-06"),
    schema: StructuredOutputFixtureFactory.schema,
    conversation: rig.createConversation(),
    rawFinalResponse: new AIMessage({ content: "not json" }),
    agentName: "Structured native success",
    nodeId: "agent_native_success",
    invokeTextModel: rig.createTextInvoker([]),
    invokeStructuredModel: rig.createStructuredInvoker(),
  });

  assert.deepEqual(result, expected);
  assert.equal(rig.capture.textMessages.length, 0);
  assert.equal(rig.capture.structuredMessages.length, 1);
  assert.deepEqual(rig.capture.structuredBindings[0]?.config, {
    method: "jsonSchema",
    strict: true,
  });
});

test("AgentStructuredOutputRunner repairs schema-invalid native structured output with outcome-focused retry data", async () => {
  const rig = new AgentStructuredOutputRunnerTestRig();
  const repaired = StructuredOutputFixtureFactory.createValidOutput({ summary: "Recovered after schema mismatch" });

  const result = await rig.runner.resolve({
    model: rig.createStructuredModel([{ outcome: "unknown", summary: 123 }]),
    chatModelConfig: new OpenAIChatModelConfig("OpenAI", "gpt-4.1-mini"),
    schema: StructuredOutputFixtureFactory.schema,
    conversation: rig.createConversation(),
    agentName: "Structured native repair",
    nodeId: "agent_native_repair",
    invokeTextModel: rig.createTextInvoker([JSON.stringify(repaired)]),
    invokeStructuredModel: rig.createStructuredInvoker(),
  });

  assert.deepEqual(result, repaired);
  assert.equal(rig.capture.structuredMessages.length, 1);
  assert.equal(rig.capture.textMessages.length, 1);
  assert.deepEqual(rig.capture.structuredBindings[0]?.config, {
    method: "functionCalling",
    strict: true,
  });
  const repairMessages = MessageInspection.contents(rig.capture.textMessages[0] ?? []);
  const repairPayload = JSON.parse(
    repairMessages.find((message) => message.includes("invalidModelOutput")) ?? "{}",
  ) as Readonly<{
    invalidModelOutput?: string;
    validationError?: string;
  }>;
  assert.equal(
    repairPayload.invalidModelOutput?.includes('"outcome":"unknown"') &&
      repairPayload.invalidModelOutput.includes('"summary":123'),
    true,
  );
  assert.equal(
    repairPayload.validationError?.includes("outcome: Invalid option") ||
      repairPayload.validationError?.includes("summary:"),
    true,
  );
});

test("AgentStructuredOutputRunner repairs after native structured output invocation errors", async () => {
  const rig = new AgentStructuredOutputRunnerTestRig();
  const repaired = StructuredOutputFixtureFactory.createValidOutput({ summary: "Recovered after native error" });

  const result = await rig.runner.resolve({
    model: rig.createStructuredModel([new Error("provider exploded")]),
    chatModelConfig: new OpenAIChatModelConfig("OpenAI", "gpt-4o-mini"),
    schema: StructuredOutputFixtureFactory.schema,
    conversation: rig.createConversation(),
    agentName: "Structured native error",
    nodeId: "agent_native_error",
    invokeTextModel: rig.createTextInvoker([JSON.stringify(repaired)]),
    invokeStructuredModel: rig.createStructuredInvoker(),
  });

  assert.deepEqual(result, repaired);
  const repairMessages = MessageInspection.contents(rig.capture.textMessages[0] ?? []);
  assert.equal(
    repairMessages.some((message) => message.includes("Native structured output failed: provider exploded")),
    true,
  );
});

test("AgentStructuredOutputRunner throws after exhausting repair attempts for non-JSON output", async () => {
  const rig = new AgentStructuredOutputRunnerTestRig();

  await assert.rejects(
    async () =>
      await rig.runner.resolve({
        model: rig.createPlainModel(),
        chatModelConfig: new PlainChatModelConfig("Plain model"),
        schema: StructuredOutputFixtureFactory.schema,
        conversation: rig.createConversation(),
        agentName: "Structured exhausted repair",
        nodeId: "agent_exhausted_repair",
        invokeTextModel: rig.createTextInvoker(["still not json", "still not json", "still not json"]),
        invokeStructuredModel: rig.createStructuredInvoker(),
      }),
    /after 2 repair attempts: Response was not valid JSON/,
  );

  assert.equal(rig.capture.textMessages.length, 3);
});

test("OpenAIStructuredOutputMethodFactory only opts into jsonSchema for supported aliases and snapshots", () => {
  const factory = new OpenAIStructuredOutputMethodFactory();

  assert.equal(factory.create(new PlainChatModelConfig("Plain model")), undefined);
  assert.deepEqual(factory.create(new OpenAIChatModelConfig("OpenAI", "gpt-4o")), {
    method: "jsonSchema",
    strict: true,
  });
  assert.deepEqual(factory.create(new OpenAIChatModelConfig("OpenAI", "gpt-4o-2024-05-13")), {
    method: "functionCalling",
    strict: true,
  });
  assert.deepEqual(factory.create(new OpenAIChatModelConfig("OpenAI", "gpt-4o-2024-08-06")), {
    method: "jsonSchema",
    strict: true,
  });
  assert.deepEqual(factory.create(new OpenAIChatModelConfig("OpenAI", "gpt-4o-mini-2024-07-17")), {
    method: "functionCalling",
    strict: true,
  });
  assert.deepEqual(factory.create(new OpenAIChatModelConfig("OpenAI", "gpt-4o-mini-2024-07-18")), {
    method: "jsonSchema",
    strict: true,
  });
  assert.deepEqual(factory.create(new OpenAIChatModelConfig("OpenAI", "gpt-4.1-mini")), {
    method: "functionCalling",
    strict: true,
  });
});
