import { isItemValue, itemValue, type ToolConfig } from "@codemation/core";
import assert from "node:assert/strict";
import { test } from "vitest";
import { OpenAIChatModelConfig } from "../src/chatModels/openAiChatModelConfig";
import { WorkflowAgentNodeFactory } from "../src/workflowAuthoring/WorkflowAgentNodeFactory.types";

class WorkflowAgentNodeFactoryToolType {}

class WorkflowAgentNodeFactoryToolConfig implements ToolConfig {
  readonly type = WorkflowAgentNodeFactoryToolType as ToolConfig["type"];

  constructor(public readonly name: string) {}
}

test("WorkflowAgentNodeFactory preserves static messages and forwards agent options", () => {
  const messages = [
    { role: "system" as const, content: "Return JSON only." },
    { role: "user" as const, content: "Summarize the current item." },
  ] as const;
  const tools = [new WorkflowAgentNodeFactoryToolConfig("lookup_customer")] as const;
  const retryPolicy = {
    kind: "fixed" as const,
    maxAttempts: 2,
    delayMs: 100,
  };
  const guardrails = {
    maxTurns: 3,
    onTurnLimitReached: "respondWithLastMessage" as const,
  };

  const agent = WorkflowAgentNodeFactory.create("Summarize", {
    messages,
    model: "openai:gpt-4o-mini",
    tools,
    id: "agent_summarize",
    retryPolicy,
    guardrails,
  });

  assert.equal(agent.name, "Summarize");
  assert.strictEqual(agent.messages, messages);
  assert.strictEqual(agent.tools, tools);
  assert.equal(agent.id, "agent_summarize");
  assert.deepEqual(agent.retryPolicy, retryPolicy);
  assert.strictEqual(agent.guardrails, guardrails);
  assert.ok(agent.chatModel instanceof OpenAIChatModelConfig);
  assert.equal(agent.chatModel.model, "gpt-4o-mini");
});

test("WorkflowAgentNodeFactory preserves itemValue-based messages without wrapping them", () => {
  const messages = itemValue<ReadonlyArray<{ role: "system" | "user"; content: string }>, { subject: string }>(
    ({ item }) => [
      { role: "system", content: 'Return strict JSON only: {"summary": string}' },
      { role: "user", content: `Subject: ${item.json.subject}` },
    ],
  );

  const agent = WorkflowAgentNodeFactory.create<{ subject: string }>({
    messages,
    model: "openai:gpt-4o-mini",
  });

  assert.equal(agent.name, "AI agent");
  assert.strictEqual(agent.messages, messages);
  assert.equal(isItemValue(agent.messages), true);
});
