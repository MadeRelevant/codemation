import { ConnectionNodeIdFactory, NodeBackedToolConfig, type ToolConfig, type ZodSchemaAny } from "@codemation/core";
import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { AIAgent } from "../src/nodes/AIAgentConfig";
import { ConnectionCredentialNodeConfigFactory } from "../src/nodes/ConnectionCredentialNodeConfigFactory";
import { ManualTrigger } from "../src/nodes/ManualTriggerFactory";
import { OpenAIChatModelConfig } from "../src/chatModels/openAiChatModelConfig";
import { AIAgentConnectionWorkflowExpander } from "../src/workflows/AIAgentConnectionWorkflowExpander";
import { createWorkflowBuilder } from "../src/workflowBuilder.types";

class NestedExpanderToolType {}

class NestedExpanderToolConfig implements ToolConfig {
  readonly type = NestedExpanderToolType as ToolConfig["type"];

  constructor(
    public readonly name: string,
    public readonly presentation?: ToolConfig["presentation"],
  ) {}
}

class NestedExpanderPassthroughSchema<TValue> {
  parse(value: TValue): TValue {
    return value;
  }
}

class NestedExpanderFixtureFactory {
  static createNestedAgentTool() {
    return new NodeBackedToolConfig(
      "research_agent",
      new AIAgent({
        name: "Researcher",
        messages: [
          { role: "system" as const, content: "Help the coordinator." },
          { role: "user" as const, content: "Use the lookup tool when needed." },
        ],
        chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4.1-mini", "openai_nested"),
        tools: [new NestedExpanderToolConfig("lookup_tool", { label: "Lookup tool" })],
      }),
      {
        description: "Run a nested agent.",
        inputSchema: new NestedExpanderPassthroughSchema<{ query: string }>() as unknown as ZodSchemaAny,
        outputSchema: new NestedExpanderPassthroughSchema<{ answer: string }>() as unknown as ZodSchemaAny,
      },
    );
  }
}

describe("AIAgentConnectionWorkflowExpander", () => {
  it("materializes recursive connection-owned nodes for nested agent tools", () => {
    const workflow = createWorkflowBuilder({
      id: "wf.ai.expander.recursive",
      name: "Recursive expander workflow",
    })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "Coordinator",
          messages: [
            { role: "system" as const, content: "Coordinate specialist work." },
            { role: "user" as const, content: "Inspect the item." },
          ],
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4.1-mini", "openai_root"),
          tools: [NestedExpanderFixtureFactory.createNestedAgentTool()],
          id: "agent_root",
        }),
      )
      .build();

    const expanded = new AIAgentConnectionWorkflowExpander(new ConnectionCredentialNodeConfigFactory()).expand(
      workflow,
    );
    const rootToolId = ConnectionNodeIdFactory.toolConnectionNodeId("agent_root", "research_agent");
    const nestedLlmId = ConnectionNodeIdFactory.languageModelConnectionNodeId(rootToolId);
    const nestedToolId = ConnectionNodeIdFactory.toolConnectionNodeId(rootToolId, "lookup_tool");

    assert.ok(expanded.nodes.some((node) => node.id === rootToolId));
    assert.ok(expanded.nodes.some((node) => node.id === nestedLlmId));
    assert.ok(expanded.nodes.some((node) => node.id === nestedToolId));
    assert.ok(
      expanded.connections?.some(
        (connection) => connection.parentNodeId === rootToolId && connection.connectionName === "llm",
      ),
    );
    assert.ok(
      expanded.connections?.some(
        (connection) =>
          connection.parentNodeId === rootToolId &&
          connection.connectionName === "tools" &&
          connection.childNodeIds.includes(nestedToolId),
      ),
    );
  });

  it("returns the original workflow when recursive connection nodes are already expanded", () => {
    const workflow = createWorkflowBuilder({
      id: "wf.ai.expander.idempotent",
      name: "Recursive expander idempotent workflow",
    })
      .trigger(new ManualTrigger("Start", "trig"))
      .then(
        new AIAgent({
          name: "Coordinator",
          messages: [
            { role: "system" as const, content: "Coordinate specialist work." },
            { role: "user" as const, content: "Inspect the item." },
          ],
          chatModel: new OpenAIChatModelConfig("OpenAI", "gpt-4.1-mini", "openai_root"),
          tools: [NestedExpanderFixtureFactory.createNestedAgentTool()],
          id: "agent_root",
        }),
      )
      .build();

    const expander = new AIAgentConnectionWorkflowExpander(new ConnectionCredentialNodeConfigFactory());
    const expanded = expander.expand(workflow);

    assert.equal(expander.expand(expanded), expanded);
  });
});
