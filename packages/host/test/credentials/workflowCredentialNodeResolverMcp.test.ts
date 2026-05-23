import { mcpSlotKey, type McpServerDeclaration } from "@codemation/core";
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
  it("includes an MCP credential slot keyed at the agent node when the catalog is wired", () => {
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
    const gmailSlot = slots.find((s) => s.nodeId === "agent-1" && s.requirement.slotKey === mcpSlotKey("gmail"));

    assert.ok(gmailSlot, "Gmail MCP credential slot should be present on the agent node");
    assert.deepEqual(gmailSlot.requirement.acceptedTypes, ["oauth.google.gmail"]);
    assert.equal(gmailSlot.requirement.label, "Gmail");
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
          mcpServers: ["gmail"],
          id: "agent-1",
        }),
      )
      .build();

    const slots = resolver.listSlots(workflow);
    const gmailSlot = slots.find((s) => s.requirement.slotKey === mcpSlotKey("gmail"));

    assert.equal(gmailSlot, undefined, "No MCP slot without catalog");
  });

  it("resolves the agent MCP credential requirement by (agent node id, mcp:<serverId>)", () => {
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

    const result = resolver.findRequirement(workflow, "agent-1", mcpSlotKey("gmail"));

    assert.ok(result, "Should find requirement for the agent MCP slot");
    assert.equal(result.requirement.slotKey, "mcp:gmail");
    assert.deepEqual(result.requirement.acceptedTypes, ["oauth.google.gmail"]);
  });
});
