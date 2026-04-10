import assert from "node:assert/strict";
import { test } from "vitest";

import { itemValue } from "../../src/contracts/itemValue";
import { AgentConfigInspector } from "../../src/ai/AgentConfigInspectorFactory";
import { AgentMessageConfigNormalizer } from "../../src/ai/AgentMessageConfigNormalizerFactory";
import { AgentConnectionNodeCollector } from "../../src/ai/AgentConnectionNodeCollector";
import { AgentToolFactory } from "../../src/ai/AgentToolFactory";
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

test("AgentConfigInspector treats itemValue-based message templates as agent configs", () => {
  const token = { name: "T" } as AgentNodeConfig<any, any>["type"];
  const chatModelType = token as unknown as AgentNodeConfig<any, any>["chatModel"]["type"];
  const agent: AgentNodeConfig<any, any> = {
    kind: "node",
    type: token,
    messages: itemValue(() => [{ role: "user", content: "hello" }]),
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

test("AgentMessageConfigNormalizer rejects raw itemValue in messages (must be resolved by engine)", () => {
  const config = {
    kind: "node" as const,
    type: {} as never,
    messages: itemValue(() => [{ role: "user" as const, content: "x" }]),
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
