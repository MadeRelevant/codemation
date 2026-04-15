import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";

import { itemExpr } from "../../src/contracts/itemExpr";
import { AgentConfigInspector } from "../../src/ai/AgentConfigInspectorFactory";
import { AgentMessageConfigNormalizer } from "../../src/ai/AgentMessageConfigNormalizerFactory";
import { AgentConnectionNodeCollector } from "../../src/ai/AgentConnectionNodeCollector";
import { AgentToolFactory } from "../../src/ai/AgentToolFactory";
import { CallableToolFactory } from "../../src/ai/CallableToolFactory";
import { callableTool } from "../../src/authoring/callableTool.types";
import { CallableToolKindToken } from "../../src/ai/CallableToolKindToken";
import { NodeBackedToolConfig } from "../../src/ai/NodeBackedToolConfig";
import type { AgentNodeConfig, ToolConfig } from "../../src/ai/AiHost";
import { ConnectionNodeIdFactory } from "../../src/workflow/definition/ConnectionNodeIdFactory";

test("ConnectionNodeIdFactory builds stable language model and tool connection node ids", () => {
  const llm = ConnectionNodeIdFactory.languageModelConnectionNodeId("agent_1");
  assert.equal(llm, "agent_1__conn__llm");
  assert.equal(ConnectionNodeIdFactory.isLanguageModelConnectionNodeId(llm), true);
});

test("ConnectionNodeIdFactory normalizes tool names and detects tool connection ids", () => {
  const tool = ConnectionNodeIdFactory.toolConnectionNodeId("agent_1", "lookup tool");
  assert.equal(tool, "agent_1__conn__tool__conn__lookup_tool");
  assert.equal(ConnectionNodeIdFactory.isToolConnectionNodeId(tool), true);
  assert.equal(ConnectionNodeIdFactory.normalizeToolName("lookup tool"), "lookup_tool");
});

test("ConnectionNodeIdFactory classifies connection-owned descendants", () => {
  assert.equal(ConnectionNodeIdFactory.isConnectionOwnedDescendantOf("agent_1", "agent_1__conn__llm"), true);
  assert.equal(ConnectionNodeIdFactory.isConnectionOwnedDescendantOf("agent_1", "agent_1__conn__tool__conn__x"), true);
  assert.equal(ConnectionNodeIdFactory.isConnectionOwnedDescendantOf("agent_1", "agent_1"), false);
});

test("ConnectionNodeIdFactory parses nested language model connection node ids", () => {
  const nestedTool = ConnectionNodeIdFactory.toolConnectionNodeId("agent_1", "planner");
  const nestedLlm = ConnectionNodeIdFactory.languageModelConnectionNodeId(nestedTool);

  assert.deepEqual(ConnectionNodeIdFactory.parseLanguageModelConnectionNodeId(nestedLlm), {
    parentNodeId: nestedTool,
  });
});

test("ConnectionNodeIdFactory parses nested tool connection node ids from the rightmost tool segment", () => {
  const nestedToolParent = ConnectionNodeIdFactory.toolConnectionNodeId("agent_1", "planner");
  const nestedTool = ConnectionNodeIdFactory.toolConnectionNodeId(nestedToolParent, "lookup tool");

  assert.deepEqual(ConnectionNodeIdFactory.parseToolConnectionNodeId(nestedTool), {
    parentNodeId: nestedToolParent,
    normalizedToolName: "lookup_tool",
  });
});

test("AgentConnectionNodeCollector uses nestedAgent role for node-backed inner agents", () => {
  const token = { name: "T" } as AgentNodeConfig<any, any>["type"];
  const chatModelType = token as unknown as AgentNodeConfig<any, any>["chatModel"]["type"];
  const inner: AgentNodeConfig<any, any> = {
    kind: "node",
    type: token,
    messages: [{ role: "user", content: "inner" }],
    chatModel: { name: "inner-llm", type: chatModelType },
  };
  const nestedTool = new NodeBackedToolConfig("specialist", inner, {
    description: "nested",
    inputSchema: {} as any,
    outputSchema: {} as any,
  });
  const plainTool = {
    name: "plain",
    type: token,
  } as unknown as ToolConfig;
  const outer: AgentNodeConfig<any, any> = {
    kind: "node",
    type: token,
    messages: [{ role: "user", content: "outer" }],
    chatModel: { name: "outer-llm", type: chatModelType },
    tools: [nestedTool, plainTool],
  };
  const collected = AgentConnectionNodeCollector.collect("root", outer);
  const specialist = collected.find(
    (c) => c.nodeId === ConnectionNodeIdFactory.toolConnectionNodeId("root", "specialist"),
  );
  const plain = collected.find((c) => c.nodeId === ConnectionNodeIdFactory.toolConnectionNodeId("root", "plain"));
  assert.equal(specialist?.role, "nestedAgent");
  assert.equal(plain?.role, "tool");
});

test("AgentConfigInspector treats itemExpr-based message templates as agent configs", () => {
  const token = { name: "T" } as AgentNodeConfig<any, any>["type"];
  const chatModelType = token as unknown as AgentNodeConfig<any, any>["chatModel"]["type"];
  const agent: AgentNodeConfig<any, any> = {
    kind: "node",
    type: token,
    messages: itemExpr(() => [{ role: "user", content: "hello" }]),
    chatModel: { name: "outer-llm", type: chatModelType },
  };

  assert.equal(AgentConfigInspector.isAgentNodeConfig(agent), true);
});

test("AgentToolFactory merges parent item json into nested agent tool input by default", () => {
  const token = { name: "T" } as AgentNodeConfig<any, any>["type"];
  const chatModelType = token as unknown as AgentNodeConfig<any, any>["chatModel"]["type"];
  const inner: AgentNodeConfig<any, any> = {
    kind: "node",
    type: token,
    name: "specialist",
    messages: [{ role: "user", content: "inner" }],
    chatModel: { name: "inner-llm", type: chatModelType },
  };
  const tool = AgentToolFactory.asTool(inner, {
    name: "specialist",
    description: "nested",
    inputSchema: {} as any,
    outputSchema: {} as any,
  });

  const mapped = tool.toNodeItem({
    input: { question: "What should we do?" },
    item: { json: { topic: "workflow orchestration" } },
    itemIndex: 0,
    items: [{ json: { topic: "workflow orchestration" } }],
    ctx: {} as never,
    node: inner,
  });

  assert.deepEqual(mapped, {
    json: {
      topic: "workflow orchestration",
      question: "What should we do?",
    },
  });
});

test("AgentMessageConfigNormalizer prefers input.messages over config templates", () => {
  const config = {
    kind: "node" as const,
    type: {} as never,
    messages: [{ role: "user" as const, content: "from config" }],
    chatModel: {} as never,
  };
  const args = {
    item: { json: {} },
    itemIndex: 0,
    items: [{ json: {} }],
    ctx: {} as never,
  };
  const fromInput = AgentMessageConfigNormalizer.resolveFromInputOrConfig(
    { messages: [{ role: "system", content: "from input" }] },
    config,
    args,
  );
  assert.deepEqual(fromInput, [{ role: "system", content: "from input" }]);
});

test("AgentMessageConfigNormalizer falls back to config when input has no messages", () => {
  const config = {
    kind: "node" as const,
    type: {} as never,
    messages: [{ role: "user" as const, content: "fallback" }],
    chatModel: {} as never,
  };
  const args = {
    item: { json: { topic: "x" } },
    itemIndex: 0,
    items: [{ json: { topic: "x" } }],
    ctx: {} as never,
  };
  const dtos = AgentMessageConfigNormalizer.resolveFromInputOrConfig({ topic: "ignored" }, config, args);
  assert.deepEqual(dtos, [{ role: "user", content: "fallback" }]);
});

test("CallableToolKindToken is a stable class token", () => {
  assert.equal(typeof CallableToolKindToken, "function");
});

test("callableTool matches CallableToolFactory.callableTool for compatibility", () => {
  const options = {
    name: "alias_check",
    inputSchema: z.object({ n: z.number() }),
    outputSchema: z.object({ doubled: z.number() }),
    execute: async ({ input }) => ({ doubled: input.n * 2 }),
  };
  const fromHelper = callableTool(options);
  const fromFactory = CallableToolFactory.callableTool(options);
  assert.equal(fromHelper.name, fromFactory.name);
  assert.equal(fromHelper.toolKind, fromFactory.toolKind);
  assert.ok(fromHelper.type === fromFactory.type);
});

test("CallableToolConfig getInputSchema and getOutputSchema return configured Zod schemas", () => {
  const inputSchema = z.object({ a: z.number() });
  const outputSchema = z.object({ b: z.string() });
  const tool = callableTool({
    name: "getters",
    inputSchema,
    outputSchema,
    execute: async () => ({ b: "ok" }),
  });
  assert.ok(tool.getInputSchema() === inputSchema);
  assert.ok(tool.getOutputSchema() === outputSchema);
});

test("callableTool builds CallableToolConfig with stable toolKind and token", () => {
  const tool = callableTool({
    name: "demo",
    inputSchema: z.object({ n: z.number() }),
    outputSchema: z.object({ doubled: z.number() }),
    execute: async ({ input }) => ({ doubled: input.n * 2 }),
  });
  assert.equal(tool.toolKind, "callable");
  assert.ok(tool.type === CallableToolKindToken);
  assert.deepEqual(tool.getCredentialRequirements(), []);
});

test("CallableToolConfig exposes credential slots", () => {
  const tool = callableTool({
    name: "with_creds",
    description: "API helper",
    presentation: { label: "With creds", icon: "lucide:key" as const },
    inputSchema: z.object({}),
    outputSchema: z.object({ ok: z.boolean() }),
    credentialRequirements: [{ slotKey: "api", label: "API", acceptedTypes: ["openai_api_key"] }],
    execute: async () => ({ ok: true }),
  });
  assert.equal(tool.getCredentialRequirements().length, 1);
  assert.equal(tool.getCredentialRequirements()[0]?.slotKey, "api");
  assert.equal(tool.description, "API helper");
  assert.equal(tool.presentation?.label, "With creds");
});

test("CallableToolConfig.executeTool parses input and output schemas", async () => {
  const tool = callableTool({
    name: "math",
    inputSchema: z.object({ a: z.number() }),
    outputSchema: z.object({ sum: z.number() }),
    execute: async ({ input }) => ({ sum: input.a + 1 }),
  });
  const out = await tool.executeTool({
    config: tool,
    input: { a: 2 },
    item: { json: {} },
    itemIndex: 0,
    items: [{ json: {} }],
    ctx: {} as never,
  });
  assert.deepEqual(out, { sum: 3 });
});

test("CallableToolConfig.executeTool rejects output that fails outputSchema", async () => {
  const tool = callableTool({
    name: "bad_out",
    inputSchema: z.object({}),
    outputSchema: z.object({ out: z.string() }),
    execute: async () => ({ out: 123 }) as unknown as { out: string },
  });
  await assert.rejects(
    async () =>
      await tool.executeTool({
        config: tool,
        input: {},
        item: { json: {} },
        itemIndex: 0,
        items: [{ json: {} }],
        ctx: {} as never,
      }),
    /Invalid/,
  );
});

test("structural detection: plain-object callable tool matches toolKind callable", () => {
  const live = callableTool({
    name: "plain",
    inputSchema: z.object({ x: z.string() }),
    outputSchema: z.object({ y: z.string() }),
    execute: async ({ input }) => ({ y: input.x }),
  });
  const plain = JSON.parse(JSON.stringify(live)) as Record<string, unknown>;
  assert.equal(plain.toolKind, "callable");
  assert.equal(plain.name, "plain");
});

test("AgentConnectionNodeCollector treats callable tools as tool role not nestedAgent", () => {
  const token = { name: "T" } as AgentNodeConfig<any, any>["type"];
  const chatModelType = token as unknown as AgentNodeConfig<any, any>["chatModel"]["type"];
  const callable = callableTool({
    name: "inline_tool",
    inputSchema: z.object({ q: z.string() }),
    outputSchema: z.object({ a: z.string() }),
    execute: async ({ input }) => ({ a: input.q }),
  });
  const agent: AgentNodeConfig<any, any> = {
    kind: "node",
    type: token,
    messages: [{ role: "user", content: "hi" }],
    chatModel: { name: "llm", type: chatModelType },
    tools: [callable],
  };
  const collected = AgentConnectionNodeCollector.collect("root", agent);
  const toolDesc = collected.find(
    (c) => c.nodeId === ConnectionNodeIdFactory.toolConnectionNodeId("root", "inline_tool"),
  );
  assert.equal(toolDesc?.role, "tool");
});

test("AgentMessageConfigNormalizer rejects raw itemExpr in messages (must be resolved by engine)", () => {
  const config = {
    kind: "node" as const,
    type: {} as never,
    messages: itemExpr(() => [{ role: "user" as const, content: "x" }]),
    chatModel: {} as never,
  };
  const args = {
    item: { json: {} },
    itemIndex: 0,
    items: [{ json: {} }],
    ctx: {} as never,
  };
  assert.throws(
    () => AgentMessageConfigNormalizer.resolveFromInputOrConfig({}, config, args),
    /must be resolved by the engine before prompt normalization/,
  );
});
