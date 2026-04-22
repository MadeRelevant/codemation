import type { ChatLanguageModel, ChatModelConfig, StructuredOutputOptions, TypeToken } from "@codemation/core";
import type { ModelMessage } from "ai";
import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import { OpenAIChatModelConfig } from "../src/chatModels/openAiChatModelConfig";
import { OpenAIChatModelFactory } from "../src/chatModels/OpenAIChatModelFactory";
import { OpenAiStrictJsonSchemaFactory } from "../src/chatModels/OpenAiStrictJsonSchemaFactory";
import { AIAgentExecutionHelpersFactory } from "../src/nodes/AIAgentExecutionHelpersFactory";
import { AgentStructuredOutputRepairPromptFactory } from "../src/nodes/AgentStructuredOutputRepairPromptFactory";
import {
  AgentStructuredOutputRunner,
  type StructuredOutputSchemaForModel,
} from "../src/nodes/AgentStructuredOutputRunner";

const structuredOutputFixtureSchema = z.object({
  outcome: z.enum(["rfq", "other"]),
  summary: z.string(),
});

type StructuredOutputFixture = z.output<typeof structuredOutputFixtureSchema>;

class StructuredOutputFixtureFactory {
  static readonly schema = structuredOutputFixtureSchema;

  static createValidOutput(overrides?: Partial<StructuredOutputFixture>): StructuredOutputFixture {
    return {
      outcome: "rfq",
      summary: "RFQ detected",
      ...overrides,
    };
  }
}

class StructuredOutputRunnerCapture {
  readonly textInvocations: ReadonlyArray<ModelMessage>[] = [];
  readonly structuredInvocations: Array<
    Readonly<{
      schema: StructuredOutputSchemaForModel;
      messages: ReadonlyArray<ModelMessage>;
      options: StructuredOutputOptions | undefined;
    }>
  > = [];

  recordText(messages: ReadonlyArray<ModelMessage>): void {
    this.textInvocations.push([...messages]);
  }

  recordStructured(
    schema: StructuredOutputSchemaForModel,
    messages: ReadonlyArray<ModelMessage>,
    options: StructuredOutputOptions | undefined,
  ): void {
    this.structuredInvocations.push({ schema, messages: [...messages], options });
  }
}

class StructuredOutputRunnerTestAssertions {
  static concatenateUserContents(messages: ReadonlyArray<ModelMessage>): string {
    return messages
      .filter((message) => message.role === "user")
      .map((message) => (typeof message.content === "string" ? message.content : JSON.stringify(message.content ?? "")))
      .join("\n");
  }
}

class PlainChatModelFactoryStub {}
const PlainChatModelFactoryToken = PlainChatModelFactoryStub as unknown as TypeToken<unknown>;

class PlainChatModelConfig implements ChatModelConfig {
  readonly type = PlainChatModelFactoryToken as unknown as ChatModelConfig["type"];
  constructor(public readonly name: string) {}
}

class StubChatLanguageModel implements ChatLanguageModel {
  readonly languageModel = {} as unknown;
  readonly modelName: string;
  readonly provider?: string;

  constructor(modelName: string, provider?: string) {
    this.modelName = modelName;
    this.provider = provider;
  }
}

class StructuredOutputRunnerTestRig {
  readonly capture = new StructuredOutputRunnerCapture();
  private readonly executionHelpers = new AIAgentExecutionHelpersFactory();
  readonly runner = new AgentStructuredOutputRunner(
    new AgentStructuredOutputRepairPromptFactory(this.executionHelpers),
    new OpenAiStrictJsonSchemaFactory(this.executionHelpers),
  );

  createConversation(): ReadonlyArray<ModelMessage> {
    return [{ role: "user", content: "Classify this mail." }];
  }

  createModel(modelName = "stub-model"): ChatLanguageModel {
    return new StubChatLanguageModel(modelName);
  }

  createTextInvoker(
    responses: ReadonlyArray<string>,
  ): (messages: ReadonlyArray<ModelMessage>) => Promise<{ text: string }> {
    let invocationCount = 0;
    return async (messages) => {
      this.capture.recordText(messages);
      const response = responses[invocationCount] ?? responses[responses.length - 1] ?? "";
      invocationCount += 1;
      return { text: response };
    };
  }

  createStructuredInvoker(
    responses: ReadonlyArray<unknown>,
  ): (
    schema: StructuredOutputSchemaForModel,
    messages: ReadonlyArray<ModelMessage>,
    options: StructuredOutputOptions | undefined,
  ) => Promise<unknown> {
    let invocationCount = 0;
    return async (schema, messages, options) => {
      this.capture.recordStructured(schema, messages, options);
      const response = responses[invocationCount] ?? responses[responses.length - 1];
      invocationCount += 1;
      if (response instanceof Error) {
        throw response;
      }
      return response;
    };
  }
}

test("AgentStructuredOutputRunner returns validated raw final text without additional invocations", async () => {
  const rig = new StructuredOutputRunnerTestRig();
  const expected = StructuredOutputFixtureFactory.createValidOutput({ summary: "Final response already valid" });

  const result = await rig.runner.resolve<StructuredOutputFixture>({
    model: rig.createModel(),
    chatModelConfig: new PlainChatModelConfig("Plain model"),
    schema: StructuredOutputFixtureFactory.schema,
    conversation: rig.createConversation(),
    rawFinalText: JSON.stringify(expected),
    agentName: "Structured raw success",
    nodeId: "agent_raw_success",
    invokeTextModel: rig.createTextInvoker([]),
    invokeStructuredModel: rig.createStructuredInvoker([]),
  });

  assert.deepEqual(result, expected);
  assert.equal(rig.capture.textInvocations.length, 0);
  assert.equal(rig.capture.structuredInvocations.length, 0);
});

test("AgentStructuredOutputRunner runs a native structured-output call for OpenAI configs and returns its validated value", async () => {
  const rig = new StructuredOutputRunnerTestRig();
  const expected = StructuredOutputFixtureFactory.createValidOutput({ summary: "Native structured result" });

  const result = await rig.runner.resolve<StructuredOutputFixture>({
    model: rig.createModel("gpt-4o-2024-08-06"),
    chatModelConfig: new OpenAIChatModelConfig("OpenAI", "gpt-4o-2024-08-06"),
    schema: StructuredOutputFixtureFactory.schema,
    conversation: rig.createConversation(),
    rawFinalText: "not json",
    agentName: "Structured native success",
    nodeId: "agent_native_success",
    invokeTextModel: rig.createTextInvoker([]),
    invokeStructuredModel: rig.createStructuredInvoker([expected]),
  });

  assert.deepEqual(result, expected);
  assert.equal(rig.capture.textInvocations.length, 0);
  assert.equal(rig.capture.structuredInvocations.length, 1);
  assert.equal(rig.capture.structuredInvocations[0]?.options?.strict, true);
});

test("AgentStructuredOutputRunner repairs after the native structured call returns schema-invalid data", async () => {
  const rig = new StructuredOutputRunnerTestRig();
  const repaired = StructuredOutputFixtureFactory.createValidOutput({ summary: "Recovered after schema mismatch" });

  const result = await rig.runner.resolve<StructuredOutputFixture>({
    model: rig.createModel("gpt-4.1-mini"),
    chatModelConfig: new OpenAIChatModelConfig("OpenAI", "gpt-4.1-mini"),
    schema: StructuredOutputFixtureFactory.schema,
    conversation: rig.createConversation(),
    agentName: "Structured native repair",
    nodeId: "agent_native_repair",
    invokeTextModel: rig.createTextInvoker([JSON.stringify(repaired)]),
    invokeStructuredModel: rig.createStructuredInvoker([{ outcome: "unknown", summary: 123 }]),
  });

  assert.deepEqual(result, repaired);
  assert.equal(rig.capture.structuredInvocations.length, 1);
  assert.equal(rig.capture.textInvocations.length, 1);
  const repairContent = StructuredOutputRunnerTestAssertions.concatenateUserContents(
    rig.capture.textInvocations[0] ?? [],
  );
  assert.equal(repairContent.includes("invalidModelOutput"), true);
  assert.equal(repairContent.includes("outcome") || repairContent.includes("summary"), true);
});

test("AgentStructuredOutputRunner repairs after a native structured call throws an unhandled error", async () => {
  const rig = new StructuredOutputRunnerTestRig();
  const repaired = StructuredOutputFixtureFactory.createValidOutput({ summary: "Recovered after native error" });

  const result = await rig.runner.resolve<StructuredOutputFixture>({
    model: rig.createModel("gpt-4o-mini"),
    chatModelConfig: new OpenAIChatModelConfig("OpenAI", "gpt-4o-mini"),
    schema: StructuredOutputFixtureFactory.schema,
    conversation: rig.createConversation(),
    agentName: "Structured native error",
    nodeId: "agent_native_error",
    invokeTextModel: rig.createTextInvoker([JSON.stringify(repaired)]),
    invokeStructuredModel: rig.createStructuredInvoker([new Error("provider exploded")]),
  });

  assert.deepEqual(result, repaired);
  const repairContent = StructuredOutputRunnerTestAssertions.concatenateUserContents(
    rig.capture.textInvocations[0] ?? [],
  );
  assert.equal(repairContent.includes("provider exploded"), true);
});

test("AgentStructuredOutputRunner throws after exhausting repair attempts when the model keeps returning non-JSON output", async () => {
  const rig = new StructuredOutputRunnerTestRig();

  await assert.rejects(
    async () =>
      await rig.runner.resolve<StructuredOutputFixture>({
        model: rig.createModel(),
        chatModelConfig: new PlainChatModelConfig("Plain model"),
        schema: StructuredOutputFixtureFactory.schema,
        conversation: rig.createConversation(),
        agentName: "Structured exhausted repair",
        nodeId: "agent_exhausted_repair",
        invokeTextModel: rig.createTextInvoker(["still not json", "still not json", "still not json"]),
        invokeStructuredModel: rig.createStructuredInvoker([]),
      }),
    /after 2 repair attempts/,
  );

  assert.equal(rig.capture.textInvocations.length, 2);
});

class StrictJsonSchemaInvariant {
  static assertStrictEverywhere(record: unknown, path: ReadonlyArray<string | number> = []): void {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      return;
    }
    const o = record as Record<string, unknown>;
    assert.equal(o["$schema"], undefined, `Unexpected $schema at ${path.join(".") || "<root>"}`);
    const typeIsObject =
      o.type === "object" || (Array.isArray(o.type) && (o.type as ReadonlyArray<unknown>).includes("object"));
    const hasObjectProperties =
      o.properties !== undefined && typeof o.properties === "object" && !Array.isArray(o.properties);
    if (typeIsObject || hasObjectProperties) {
      const props = (o.properties ?? {}) as Record<string, unknown>;
      assert.equal(
        o.additionalProperties,
        false,
        `additionalProperties must be false at ${path.join(".") || "<root>"}`,
      );
      assert.deepEqual(
        o.required,
        Object.keys(props),
        `required must list every property at ${path.join(".") || "<root>"}`,
      );
      for (const [key, value] of Object.entries(props)) {
        StrictJsonSchemaInvariant.assertStrictEverywhere(value, [...path, "properties", key]);
      }
    }
    for (const key of ["allOf", "anyOf", "oneOf", "prefixItems"] as const) {
      const branch = o[key];
      if (Array.isArray(branch)) {
        for (let i = 0; i < branch.length; i += 1) {
          StrictJsonSchemaInvariant.assertStrictEverywhere(branch[i], [...path, key, i]);
        }
      }
    }
    if (o.items) {
      if (Array.isArray(o.items)) {
        for (let i = 0; i < o.items.length; i += 1) {
          StrictJsonSchemaInvariant.assertStrictEverywhere(o.items[i], [...path, "items", i]);
        }
      } else {
        StrictJsonSchemaInvariant.assertStrictEverywhere(o.items, [...path, "items"]);
      }
    }
    if (o.not) StrictJsonSchemaInvariant.assertStrictEverywhere(o.not, [...path, "not"]);
    for (const key of ["$defs", "definitions"] as const) {
      const defs = o[key];
      if (defs && typeof defs === "object" && !Array.isArray(defs)) {
        for (const [n, v] of Object.entries(defs as Record<string, unknown>)) {
          StrictJsonSchemaInvariant.assertStrictEverywhere(v, [...path, key, n]);
        }
      }
    }
  }
}

async function captureStructuredInvocationSchema(
  rig: StructuredOutputRunnerTestRig,
  schema: z.ZodTypeAny,
): Promise<StructuredOutputSchemaForModel | undefined> {
  await rig.runner
    .resolve({
      model: rig.createModel("gpt-4o-2024-08-06"),
      chatModelConfig: new OpenAIChatModelConfig("OpenAI", "gpt-4o-2024-08-06"),
      schema,
      conversation: rig.createConversation(),
      agentName: "binding",
      nodeId: "agent_binding",
      invokeTextModel: rig.createTextInvoker([JSON.stringify({ ok: true })]),
      invokeStructuredModel: rig.createStructuredInvoker([new Error("capture-only")]),
    })
    .catch(() => undefined);
  return rig.capture.structuredInvocations[0]?.schema;
}

test("AgentStructuredOutputRunner hands OpenAI-strict calls a plain JSON Schema record (not a Zod instance) for simple object schemas", async () => {
  const rig = new StructuredOutputRunnerTestRig();
  const schemaRecord = await captureStructuredInvocationSchema(rig, StructuredOutputFixtureFactory.schema);

  assert.ok(schemaRecord);
  assert.equal(typeof schemaRecord === "object" && schemaRecord !== null, true);
  const record = schemaRecord as Record<string, unknown>;
  assert.equal("_zod" in record, false);
  assert.equal("parse" in record, false);
  StrictJsonSchemaInvariant.assertStrictEverywhere(record);
});

test("AgentStructuredOutputRunner hands OpenAI-strict calls a strict JSON Schema record for z.discriminatedUnion roots", async () => {
  const rig = new StructuredOutputRunnerTestRig();
  const schema = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a"), value: z.string() }),
    z.object({ kind: z.literal("b"), count: z.number() }),
  ]);
  const schemaRecord = await captureStructuredInvocationSchema(rig, schema);

  assert.ok(schemaRecord);
  StrictJsonSchemaInvariant.assertStrictEverywhere(schemaRecord);
});

test("AgentStructuredOutputRunner hands OpenAI-strict calls a strict JSON Schema record for deeply nested object schemas", async () => {
  const rig = new StructuredOutputRunnerTestRig();
  const schema = z.object({
    company: z.object({ name: z.string(), confidence: z.number() }),
    lineItems: z.array(
      z.object({
        sku: z.string().nullable(),
        description: z.string(),
        quantity: z.number(),
      }),
    ),
  });
  const schemaRecord = await captureStructuredInvocationSchema(rig, schema);

  assert.ok(schemaRecord);
  StrictJsonSchemaInvariant.assertStrictEverywhere(schemaRecord);
});

test("AgentStructuredOutputRunner only sets strict structured-output options for configs created by OpenAIChatModelFactory", async () => {
  const rig = new StructuredOutputRunnerTestRig();

  await rig.runner
    .resolve({
      model: rig.createModel(),
      chatModelConfig: new PlainChatModelConfig("Plain model"),
      schema: StructuredOutputFixtureFactory.schema,
      conversation: rig.createConversation(),
      agentName: "plain-binding",
      nodeId: "agent_plain_binding",
      invokeTextModel: rig.createTextInvoker([JSON.stringify(StructuredOutputFixtureFactory.createValidOutput())]),
      invokeStructuredModel: rig.createStructuredInvoker([new Error("capture-only")]),
    })
    .catch(() => undefined);

  assert.equal(rig.capture.structuredInvocations[0]?.options, undefined);
  void OpenAIChatModelFactory;
});
