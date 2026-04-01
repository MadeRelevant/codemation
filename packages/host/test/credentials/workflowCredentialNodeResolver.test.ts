import { ConnectionNodeIdFactory } from "@codemation/core";
import {
  AIAgent,
  AIAgentConnectionWorkflowExpander,
  ConnectionCredentialNodeConfigFactory,
  ManualTrigger,
  OpenAIChatModelConfig,
  createWorkflowBuilder,
} from "@codemation/core-nodes";
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { WorkflowCredentialNodeResolver } from "../../src/domain/credentials/WorkflowCredentialNodeResolver";

const agentMessages = [
  { role: "system" as const, content: "You are helpful." },
  { role: "user" as const, content: "Inspect this item." },
];

describe("WorkflowCredentialNodeResolver", () => {
  const resolver = new WorkflowCredentialNodeResolver();

  it("lists connection-shaped LLM node ids when workflow has no connection metadata", () => {
    const workflow = createWorkflowBuilder({
      id: "wf.ai.attachments",
      name: "AI attachments",
    })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "Agent",
          messages: agentMessages,
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4.1-mini"),
          id: "agent_1",
        }),
      )
      .build();

    const slots = resolver.listSlots(workflow);
    const nodeIds = slots.map((s) => s.nodeId);
    assert.ok(nodeIds.includes(ConnectionNodeIdFactory.languageModelConnectionNodeId("agent_1")));
    assert.ok(!nodeIds.includes("agent_1"));
  });

  it("lists connection node ids after AI agent connection expansion", () => {
    const raw = createWorkflowBuilder({
      id: "wf.ai.attachments",
      name: "AI attachments",
    })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "Agent",
          messages: agentMessages,
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4.1-mini"),
          id: "agent_1",
        }),
      )
      .build();
    const workflow = new AIAgentConnectionWorkflowExpander(new ConnectionCredentialNodeConfigFactory()).expand(raw);
    const slots = resolver.listSlots(workflow);
    const nodeIds = slots.map((s) => s.nodeId);
    assert.ok(nodeIds.includes(ConnectionNodeIdFactory.languageModelConnectionNodeId("agent_1")));
  });

  it("describes connection LLM node ids with agent › language model label", () => {
    const workflow = createWorkflowBuilder({
      id: "wf.ai.attachments",
      name: "AI attachments",
    })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "My agent",
          messages: agentMessages,
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4.1-mini", "openai"),
          id: "agent_1",
        }),
      )
      .build();

    const lmId = ConnectionNodeIdFactory.languageModelConnectionNodeId("agent_1");

    assert.equal(resolver.describeCredentialNodeDisplay(workflow, lmId), "My agent › Language model");
  });

  it("resolves credential requirements for connection-shaped LLM node id and rejects parent agent node id", () => {
    const workflow = createWorkflowBuilder({
      id: "wf.ai.attachments",
      name: "AI attachments",
    })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "Agent",
          messages: agentMessages,
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4.1-mini", "openai"),
          id: "agent_1",
        }),
      )
      .build();

    const lmId = ConnectionNodeIdFactory.languageModelConnectionNodeId("agent_1");
    const lm = resolver.findRequirement(workflow, lmId, "openai");
    assert.equal(lm?.requirement.slotKey, "openai");

    assert.equal(resolver.findRequirement(workflow, "agent_1", "openai"), undefined);
  });

  it("resolves credential requirements for expanded connection LLM node id", () => {
    const raw = createWorkflowBuilder({
      id: "wf.ai.attachments",
      name: "AI attachments",
    })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "Agent",
          messages: agentMessages,
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4.1-mini", "openai"),
          id: "agent_1",
        }),
      )
      .build();
    const workflow = new AIAgentConnectionWorkflowExpander(new ConnectionCredentialNodeConfigFactory()).expand(raw);
    const llmId = ConnectionNodeIdFactory.languageModelConnectionNodeId("agent_1");
    const lm = resolver.findRequirement(workflow, llmId, "openai");
    assert.equal(lm?.requirement.slotKey, "openai");
  });
});
