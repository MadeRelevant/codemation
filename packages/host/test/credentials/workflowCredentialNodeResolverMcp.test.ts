import { ConnectionNodeIdFactory, type McpServerDeclaration } from "@codemation/core";
import { AIAgent, ManualTrigger, OpenAIChatModelConfig, createWorkflowBuilder } from "@codemation/core-nodes";
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { WorkflowCredentialNodeResolver } from "../../src/domain/credentials/WorkflowCredentialNodeResolver";

const agentMessages = [{ role: "system" as const, content: "You are helpful." }];

const gmailDecl: McpServerDeclaration = {
  id: "gmail",
  displayName: "Gmail",
  description: "Gmail via MCP",
  transport: "http",
  url: "https://example.com/mcp",
  acceptedCredentialTypes: ["oauth.google.gmail"],
  requiredScopes: [],
  staticHeaders: {},
  toolDescriptionOverrides: {},
};

const mockCatalog = { get: (id: string) => (id === "gmail" ? gmailDecl : undefined) } as never;

describe("WorkflowCredentialNodeResolver — MCP slots", () => {
  it("includes MCP credential slot when mcpCatalog is provided", () => {
    const resolver = new WorkflowCredentialNodeResolver(mockCatalog);

    const workflow = createWorkflowBuilder({ id: "wf.test", name: "Test" })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "Gmail reader",
          messages: agentMessages,
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4o-mini", "openai"),
          mcpServers: { gmail: { credential: "my-gmail-cred" } },
          id: "agent-1",
        }),
      )
      .build();

    const slots = resolver.listSlots(workflow);
    const gmailNodeId = ConnectionNodeIdFactory.mcpConnectionNodeId("agent-1", "gmail");
    const gmailSlot = slots.find((s) => s.nodeId === gmailNodeId);

    assert.ok(gmailSlot, "Gmail MCP credential slot should be present");
    assert.equal(gmailSlot.requirement.slotKey, "credential");
    assert.deepEqual(gmailSlot.requirement.acceptedTypes, ["oauth.google.gmail"]);
  });

  it("excludes MCP credential slot when no mcpCatalog injected", () => {
    const resolver = new WorkflowCredentialNodeResolver();

    const workflow = createWorkflowBuilder({ id: "wf.test", name: "Test" })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "Gmail reader",
          messages: agentMessages,
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4o-mini", "openai"),
          mcpServers: { gmail: { credential: "my-gmail-cred" } },
          id: "agent-1",
        }),
      )
      .build();

    const slots = resolver.listSlots(workflow);
    const gmailNodeId = ConnectionNodeIdFactory.mcpConnectionNodeId("agent-1", "gmail");
    const gmailSlot = slots.find((s) => s.nodeId === gmailNodeId);

    assert.equal(gmailSlot, undefined, "No MCP slot without catalog");
  });

  it("resolves MCP credential requirement by node ID", () => {
    const resolver = new WorkflowCredentialNodeResolver(mockCatalog);

    const workflow = createWorkflowBuilder({ id: "wf.test", name: "Test" })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "Gmail reader",
          messages: agentMessages,
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4o-mini", "openai"),
          mcpServers: { gmail: { credential: "my-gmail-cred" } },
          id: "agent-1",
        }),
      )
      .build();

    const gmailNodeId = ConnectionNodeIdFactory.mcpConnectionNodeId("agent-1", "gmail");
    const result = resolver.findRequirement(workflow, gmailNodeId, "credential");

    assert.ok(result, "Should find requirement for MCP node");
    assert.equal(result.requirement.slotKey, "credential");
    assert.deepEqual(result.requirement.acceptedTypes, ["oauth.google.gmail"]);
  });
});
