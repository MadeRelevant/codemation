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

const GMAIL_MCP_NODE_ID = ConnectionNodeIdFactory.mcpConnectionNodeId("agent-1", "gmail");

describe("WorkflowCredentialNodeResolver — MCP slots", () => {
  it("attaches the credential slot to the MCP connection node (slot key 'credential')", () => {
    const resolver = new WorkflowCredentialNodeResolver(mockCatalog);

    const workflow = createWorkflowBuilder({ id: "wf.test", name: "Test" })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "Gmail reader",
          messages: agentMessages,
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4o-mini", "openai"),
          mcpServers: ["gmail"],
          id: "agent-1",
        }),
      )
      .build();

    const slots = resolver.listSlots(workflow);
    const gmailSlot = slots.find((s) => s.nodeId === GMAIL_MCP_NODE_ID && s.requirement.slotKey === "credential");

    assert.ok(gmailSlot, "Gmail MCP credential slot should be present on the MCP connection node");
    assert.deepEqual(gmailSlot.requirement.acceptedTypes, ["oauth.google.gmail"]);
    assert.equal(gmailSlot.requirement.label, "Gmail");
  });

  it("excludes the MCP credential slot when no mcpCatalog is injected", () => {
    const resolver = new WorkflowCredentialNodeResolver();

    const workflow = createWorkflowBuilder({ id: "wf.test", name: "Test" })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "Gmail reader",
          messages: agentMessages,
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4o-mini", "openai"),
          mcpServers: ["gmail"],
          id: "agent-1",
        }),
      )
      .build();

    const slots = resolver.listSlots(workflow);
    const gmailSlot = slots.find((s) => s.nodeId === GMAIL_MCP_NODE_ID);

    assert.equal(gmailSlot, undefined, "No MCP slot without catalog");
  });

  it("resolves the MCP credential requirement by (mcpConnectionNodeId, 'credential')", () => {
    const resolver = new WorkflowCredentialNodeResolver(mockCatalog);

    const workflow = createWorkflowBuilder({ id: "wf.test", name: "Test" })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "Gmail reader",
          messages: agentMessages,
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4o-mini", "openai"),
          mcpServers: ["gmail"],
          id: "agent-1",
        }),
      )
      .build();

    const result = resolver.findRequirement(workflow, GMAIL_MCP_NODE_ID, "credential");

    assert.ok(result, "Should find requirement for the MCP connection node");
    assert.equal(result.requirement.slotKey, "credential");
    assert.deepEqual(result.requirement.acceptedTypes, ["oauth.google.gmail"]);
  });
});
