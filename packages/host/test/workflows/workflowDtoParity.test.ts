import {
  AllWorkflowsActiveWorkflowActivationPolicy,
  chatModel,
  NodeBackedToolConfig,
  tool,
  type ChatModelConfig,
  type ToolConfig,
  type ZodSchemaAny,
} from "@codemation/core";
import { PersistedWorkflowTokenRegistry } from "@codemation/core/bootstrap";
import { PersistedWorkflowSnapshotFactory } from "@codemation/core/testing";
import {
  AIAgent,
  AIAgentConnectionWorkflowExpander,
  ConnectionCredentialNodeConfigFactory,
  ManualTrigger,
  createWorkflowBuilder,
} from "@codemation/core-nodes";
import { PersistedWorkflowSnapshotMapper } from "@codemation/next-host/src/features/workflows/lib/workflowDetail/PersistedWorkflowSnapshotMapper";
import { describe, expect, it } from "vitest";
import { WorkflowDefinitionMapper } from "../../src/application/mapping/WorkflowDefinitionMapper";
import { WorkflowPolicyUiPresentationFactory } from "../../src/application/mapping/WorkflowPolicyUiPresentationFactory";
import { WorkflowDetailFixtureFactory } from "../workflowDetail/testkit";

@chatModel({ packageName: "@codemation/host-parity" })
class FrontendParityChatModelFactory {}

@tool({ packageName: "@codemation/host-parity" })
class FrontendParityTool {}

class FrontendParityChatModelConfig implements ChatModelConfig {
  readonly type = FrontendParityChatModelFactory as ChatModelConfig["type"];

  constructor(
    public readonly name: string,
    public readonly presentation?: ChatModelConfig["presentation"],
  ) {}
}

class FrontendParityToolConfig implements ToolConfig {
  readonly type = FrontendParityTool as ToolConfig["type"];

  constructor(
    public readonly name: string,
    public readonly description?: string,
    public readonly presentation?: ToolConfig["presentation"],
  ) {}
}

class RecursiveParityPassthroughSchema<TValue> {
  parse(value: TValue): TValue {
    return value;
  }
}

class RecursiveParityFixtureFactory {
  static createNestedAgentTool() {
    return new NodeBackedToolConfig(
      "research_agent",
      new AIAgent({
        name: "Researcher",
        messages: [{ role: "user", content: "Research the current task." }],
        chatModel: new FrontendParityChatModelConfig("Research LLM", { label: "Research LLM" }),
        tools: [new FrontendParityToolConfig("lookup_tool", "Lookup tool", { label: "Lookup tool" })],
      }),
      {
        description: "Nested agent",
        inputSchema: new RecursiveParityPassthroughSchema<{ query: string }>() as unknown as ZodSchemaAny,
        outputSchema: new RecursiveParityPassthroughSchema<{ answer: string }>() as unknown as ZodSchemaAny,
      },
    );
  }
}

describe("workflow dto parity", () => {
  it("maps persisted snapshots to the same workflow dto shape as the live workflow mapper", () => {
    const workflow = WorkflowDetailFixtureFactory.createWorkflowDefinition({
      workflowId: "wf.frontend.parity",
      workflowName: "Frontend parity workflow",
      chatModelConfig: new FrontendParityChatModelConfig("Mock LLM", { label: "Mock LLM" }),
      toolConfigs: [new FrontendParityToolConfig("lookup_tool", "Lookup tool", { label: "Lookup tool" })],
    });
    const liveDto = new WorkflowDefinitionMapper(
      new WorkflowPolicyUiPresentationFactory(),
      new AllWorkflowsActiveWorkflowActivationPolicy(),
    ).mapSync(workflow);
    const tokenRegistry = new PersistedWorkflowTokenRegistry();
    tokenRegistry.registerFromWorkflows([workflow]);
    const snapshot = new PersistedWorkflowSnapshotFactory(tokenRegistry).create(workflow);
    const snapshotDto = new PersistedWorkflowSnapshotMapper().map(snapshot);

    const { active: _liveActive, ...liveWithoutActivation } = liveDto;
    const { active: _snapActive, ...snapshotWithoutActivation } = snapshotDto;
    expect(snapshotWithoutActivation).toEqual(liveWithoutActivation);
  });

  it("keeps persisted and live workflow dto shapes aligned for nested agent tools", () => {
    const workflow = createWorkflowBuilder({
      id: "wf.frontend.parity.recursive",
      name: "Frontend recursive parity workflow",
    })
      .trigger(new ManualTrigger("Start", "trigger"))
      .then(
        new AIAgent({
          name: "Coordinator",
          messages: [{ role: "user", content: "Coordinate the specialist." }],
          chatModel: new FrontendParityChatModelConfig("Coordinator LLM", { label: "Coordinator LLM" }),
          tools: [RecursiveParityFixtureFactory.createNestedAgentTool()],
          id: "agent_root",
        }),
      )
      .build();

    const liveDto = new WorkflowDefinitionMapper(
      new WorkflowPolicyUiPresentationFactory(),
      new AllWorkflowsActiveWorkflowActivationPolicy(),
    ).mapSync(workflow);
    const tokenRegistry = new PersistedWorkflowTokenRegistry();
    tokenRegistry.registerFromWorkflows([workflow]);
    const snapshot = new PersistedWorkflowSnapshotFactory(tokenRegistry).create(workflow);
    const snapshotDto = new PersistedWorkflowSnapshotMapper().map(snapshot);

    const { active: _liveActive, ...liveWithoutActivation } = liveDto;
    const { active: _snapActive, ...snapshotWithoutActivation } = snapshotDto;
    expect(snapshotWithoutActivation).toEqual(liveWithoutActivation);
  });

  it("keeps persisted and live workflow dto shapes aligned for expanded nested agent connections", () => {
    const rawWorkflow = createWorkflowBuilder({
      id: "wf.frontend.parity.recursive.expanded",
      name: "Frontend recursive expanded parity workflow",
    })
      .trigger(new ManualTrigger("Start", "trigger"))
      .then(
        new AIAgent({
          name: "Coordinator",
          messages: [{ role: "user", content: "Coordinate the specialist." }],
          chatModel: new FrontendParityChatModelConfig("Coordinator LLM", { label: "Coordinator LLM" }),
          tools: [RecursiveParityFixtureFactory.createNestedAgentTool()],
          id: "agent_root",
        }),
      )
      .build();
    const workflow = new AIAgentConnectionWorkflowExpander(new ConnectionCredentialNodeConfigFactory()).expand(
      rawWorkflow,
    );
    const liveDto = new WorkflowDefinitionMapper(
      new WorkflowPolicyUiPresentationFactory(),
      new AllWorkflowsActiveWorkflowActivationPolicy(),
    ).mapSync(workflow);
    const tokenRegistry = new PersistedWorkflowTokenRegistry();
    tokenRegistry.registerFromWorkflows([workflow]);
    const snapshot = new PersistedWorkflowSnapshotFactory(tokenRegistry).create(workflow);
    const snapshotDto = new PersistedWorkflowSnapshotMapper().map(snapshot);

    const { active: _liveActive, ...liveWithoutActivation } = liveDto;
    const { active: _snapActive, ...snapshotWithoutActivation } = snapshotDto;
    expect(snapshotWithoutActivation).toEqual(liveWithoutActivation);
  });

  it("keeps persisted and live workflow dto shapes aligned for agent outputSchema", () => {
    const workflow = createWorkflowBuilder({
      id: "wf.frontend.parity.structured-output",
      name: "Frontend structured output parity workflow",
    })
      .trigger(new ManualTrigger("Start", "trigger"))
      .then(
        new AIAgent({
          name: "Structured coordinator",
          messages: [{ role: "user", content: "Return a structured classification." }],
          chatModel: new FrontendParityChatModelConfig("Coordinator LLM", { label: "Coordinator LLM" }),
          outputSchema: new RecursiveParityPassthroughSchema<{
            outcome: "rfq" | "other";
            summary: string;
          }>() as unknown as ZodSchemaAny,
          id: "agent_structured",
        }),
      )
      .build();

    const liveDto = new WorkflowDefinitionMapper(
      new WorkflowPolicyUiPresentationFactory(),
      new AllWorkflowsActiveWorkflowActivationPolicy(),
    ).mapSync(workflow);
    const tokenRegistry = new PersistedWorkflowTokenRegistry();
    tokenRegistry.registerFromWorkflows([workflow]);
    const snapshot = new PersistedWorkflowSnapshotFactory(tokenRegistry).create(workflow);
    const snapshotDto = new PersistedWorkflowSnapshotMapper().map(snapshot);

    const { active: _liveActive, ...liveWithoutActivation } = liveDto;
    const { active: _snapActive, ...snapshotWithoutActivation } = snapshotDto;
    expect(snapshotWithoutActivation).toEqual(liveWithoutActivation);
  });
});
