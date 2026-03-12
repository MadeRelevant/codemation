import { PersistedWorkflowSnapshotFactory, WorkflowBuilder, type ChatModelConfig, type ToolConfig } from "@codemation/core";
import { AIAgent, Callback, ManualTrigger } from "@codemation/core-nodes";
import { describe, expect, it } from "vitest";
import { CodemationPersistedWorkflowDtoMapper } from "../src/host/codemationPersistedWorkflowDtoMapper";
import { CodemationWorkflowDtoMapper } from "../src/host/codemationWorkflowDtoMapper";

class FrontendParityChatModelFactory {}

class FrontendParityTool {}

class FrontendParityChatModelConfig implements ChatModelConfig {
  readonly token = FrontendParityChatModelFactory as ChatModelConfig["token"];
  readonly tokenId = "codemation.frontend-parity.chat-model";

  constructor(
    public readonly name: string,
    public readonly presentation?: ChatModelConfig["presentation"],
  ) {}
}

class FrontendParityToolConfig implements ToolConfig {
  readonly token = FrontendParityTool as ToolConfig["token"];
  readonly tokenId = "codemation.frontend-parity.tool";

  constructor(
    public readonly name: string,
    public readonly description?: string,
    public readonly presentation?: ToolConfig["presentation"],
  ) {}
}

class FrontendParityFixtureFactory {
  static createWorkflow() {
    return new WorkflowBuilder({ id: "wf.frontend.parity", name: "Frontend parity workflow" })
      .trigger(new ManualTrigger("Manual trigger", "trigger"))
      .then(new Callback("Node 1", undefined, "node_1"))
      .then(
        new AIAgent(
          "Agent",
          "Inspect the item and use the tool when needed.",
          (item) => JSON.stringify(item.json ?? {}),
          new FrontendParityChatModelConfig("Mock LLM", { label: "Mock LLM" }),
          [new FrontendParityToolConfig("lookup_tool", "Lookup tool", { label: "Lookup tool" })],
          "agent",
        ),
      )
      .then(new Callback("Node 2", undefined, "node_2"))
      .build();
  }
}

describe("workflow dto parity", () => {
  it("maps persisted snapshots to the same workflow dto shape as the live workflow mapper", () => {
    const workflow = FrontendParityFixtureFactory.createWorkflow();
    const liveDto = new CodemationWorkflowDtoMapper().toDetail(workflow);
    const snapshot = new PersistedWorkflowSnapshotFactory().create(workflow);
    const snapshotDto = new CodemationPersistedWorkflowDtoMapper().toDetail(snapshot);

    expect(snapshotDto).toEqual(liveDto);
  });
});
