import { ConnectionNodeIdFactory, NodeBackedToolConfig, type ToolConfig, type ZodSchemaAny } from "@codemation/core";
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

class NestedResolverToolType {}

class NestedResolverToolConfig implements ToolConfig {
  readonly type = NestedResolverToolType as ToolConfig["type"];

  constructor(
    public readonly name: string,
    private readonly slotKey?: string,
    public readonly presentation?: ToolConfig["presentation"],
  ) {}

  getCredentialRequirements(): ReadonlyArray<{
    slotKey: string;
    label: string;
    acceptedTypes: ReadonlyArray<string>;
  }> {
    if (!this.slotKey) {
      return [];
    }
    return [
      {
        slotKey: this.slotKey,
        label: `${this.name} credential`,
        acceptedTypes: ["test"],
      },
    ];
  }
}

class NestedResolverPassthroughSchema<TValue> {
  parse(value: TValue): TValue {
    return value;
  }
}

class NestedWorkflowCredentialFixtureFactory {
  static createNestedAgentTool() {
    return new NodeBackedToolConfig(
      "research_agent",
      new AIAgent({
        name: "Researcher",
        messages: agentMessages,
        chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4.1-mini", "openai_nested"),
        tools: [new NestedResolverToolConfig("lookup_tool", "lookup_slot", { label: "Lookup tool" })],
      }),
      {
        description: "Run a nested agent.",
        inputSchema: new NestedResolverPassthroughSchema<{ query: string }>() as unknown as ZodSchemaAny,
        outputSchema: new NestedResolverPassthroughSchema<{ answer: string }>() as unknown as ZodSchemaAny,
      },
    );
  }
}

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

  it("lists nested agent connection slots without requiring expansion metadata", () => {
    const workflow = createWorkflowBuilder({
      id: "wf.ai.nested.attachments",
      name: "Nested AI attachments",
    })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "Coordinator",
          messages: agentMessages,
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4.1-mini", "openai_root"),
          tools: [NestedWorkflowCredentialFixtureFactory.createNestedAgentTool()],
          id: "agent_root",
        }),
      )
      .build();

    const nestedToolId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_root", "research_agent");
    const nestedLlmId = ConnectionNodeIdFactory.languageModelConnectionNodeId(nestedToolId);
    const nestedInnerToolId = ConnectionNodeIdFactory.toolConnectionNodeId(nestedToolId, "lookup_tool");

    const nodeIds = resolver.listSlots(workflow).map((slot) => slot.nodeId);

    assert.ok(nodeIds.includes(ConnectionNodeIdFactory.languageModelConnectionNodeId("agent_root")));
    assert.ok(nodeIds.includes(nestedLlmId));
    assert.ok(nodeIds.includes(nestedInnerToolId));
  });

  it("resolves nested agent credential requirements by recursive connection node id", () => {
    const workflow = createWorkflowBuilder({
      id: "wf.ai.nested.requirements",
      name: "Nested AI requirements",
    })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "Coordinator",
          messages: agentMessages,
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4.1-mini", "openai_root"),
          tools: [NestedWorkflowCredentialFixtureFactory.createNestedAgentTool()],
          id: "agent_root",
        }),
      )
      .build();

    const nestedToolId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_root", "research_agent");
    const nestedLlmId = ConnectionNodeIdFactory.languageModelConnectionNodeId(nestedToolId);
    const nestedInnerToolId = ConnectionNodeIdFactory.toolConnectionNodeId(nestedToolId, "lookup_tool");

    assert.equal(
      resolver.findRequirement(workflow, nestedLlmId, "openai_nested")?.requirement.slotKey,
      "openai_nested",
    );
    assert.equal(
      resolver.findRequirement(workflow, nestedInnerToolId, "lookup_slot")?.requirement.slotKey,
      "lookup_slot",
    );
  });

  it("describes nested agent connection node ids with the tool ancestry", () => {
    const workflow = createWorkflowBuilder({
      id: "wf.ai.nested.labels",
      name: "Nested AI labels",
    })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "Coordinator",
          messages: agentMessages,
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4.1-mini", "openai_root"),
          tools: [NestedWorkflowCredentialFixtureFactory.createNestedAgentTool()],
          id: "agent_root",
        }),
      )
      .build();

    const nestedToolId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_root", "research_agent");
    const nestedLlmId = ConnectionNodeIdFactory.languageModelConnectionNodeId(nestedToolId);

    assert.equal(
      resolver.describeCredentialNodeDisplay(workflow, nestedLlmId),
      "Coordinator › research_agent › Language model",
    );
  });
});
