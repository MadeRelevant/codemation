import type { Item, Items, NodeExecutionContext, ToolConfig, ZodSchemaAny } from "@codemation/core";
import { convertToOpenAITool } from "@langchain/core/utils/function_calling";
import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import { AIAgentExecutionHelpersFactory } from "../src/nodes/AIAgentExecutionHelpersFactory";

class SpecialistToolToken {}

test("AIAgentExecutionHelpersFactory normalizes tool schema so OpenAI parameters omit $schema", () => {
  const factory = new AIAgentExecutionHelpersFactory();
  const config: ToolConfig = {
    type: SpecialistToolToken,
    name: "specialist",
    description: "Nested sub-agent",
  };
  const tool = factory.createDynamicStructuredTool(
    {
      config,
      runtime: {
        defaultDescription: "",
        inputSchema: z.object({ question: z.string() }),
        execute: async () => ({}),
      },
    },
    {} as NodeExecutionContext<any>,
    { json: {} } as Item,
    0,
    [] as Items,
  );
  const openai = convertToOpenAITool(tool);
  const params = openai.function.parameters as Record<string, unknown>;
  assert.equal(params.type, "object");
  assert.ok(params.properties && typeof params.properties === "object");
  assert.equal(params["$schema"], undefined);
});

test("AIAgentExecutionHelpersFactory accepts JSON Schema object type with omitted properties (OpenAI empty object)", () => {
  const factory = new AIAgentExecutionHelpersFactory();
  const config: ToolConfig = {
    type: SpecialistToolToken,
    name: "specialist",
    description: "Nested sub-agent",
  };
  const tool = factory.createDynamicStructuredTool(
    {
      config,
      runtime: {
        defaultDescription: "",
        inputSchema: { type: "object", additionalProperties: false } as unknown as ZodSchemaAny,
        execute: async () => ({}),
      },
    },
    {} as NodeExecutionContext<any>,
    { json: {} } as Item,
    0,
    [] as Items,
  );
  const openai = convertToOpenAITool(tool);
  const params = openai.function.parameters as Record<string, unknown>;
  assert.equal(params.type, "object");
  assert.deepEqual(params.properties, {});
  assert.equal(params["$schema"], undefined);
});

test("AIAgentExecutionHelpersFactory tool invoke validates with @cfworker/json-schema (required is iterable)", async () => {
  const factory = new AIAgentExecutionHelpersFactory();
  const config: ToolConfig = {
    type: SpecialistToolToken,
    name: "specialist",
    description: "Nested sub-agent",
  };
  const tool = factory.createDynamicStructuredTool(
    {
      config,
      runtime: {
        defaultDescription: "",
        inputSchema: z.object({ question: z.string() }),
        execute: async () => ({ ok: true }),
      },
    },
    {} as NodeExecutionContext<any>,
    { json: {} } as Item,
    0,
    [] as Items,
  );
  const out = await tool.invoke({ question: "hello" });
  assert.ok(typeof out === "string");
});
