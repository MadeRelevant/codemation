import { PersistedWorkflowTokenRegistry,chatModel,tool,type ChatModelConfig,type ToolConfig } from "@codemation/core";
import { PersistedWorkflowSnapshotFactory } from "@codemation/core/testing";
import { PersistedWorkflowSnapshotMapper } from "@codemation/next-host/src/features/workflows/lib/workflowDetail/PersistedWorkflowSnapshotMapper";
import { describe,expect,it } from "vitest";
import { WorkflowDefinitionMapper } from "../src/application/mapping/WorkflowDefinitionMapper";
import { WorkflowPolicyUiPresentationFactory } from "../src/application/mapping/WorkflowPolicyUiPresentationFactory";
import { WorkflowDetailFixtureFactory } from "./workflowDetail/testkit";

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

describe("workflow dto parity", () => {
  it("maps persisted snapshots to the same workflow dto shape as the live workflow mapper", () => {
    const workflow = WorkflowDetailFixtureFactory.createWorkflowDefinition({
      workflowId: "wf.frontend.parity",
      workflowName: "Frontend parity workflow",
      chatModelConfig: new FrontendParityChatModelConfig("Mock LLM", { label: "Mock LLM" }),
      toolConfigs: [new FrontendParityToolConfig("lookup_tool", "Lookup tool", { label: "Lookup tool" })],
    });
    const liveDto = new WorkflowDefinitionMapper(new WorkflowPolicyUiPresentationFactory()).mapSync(workflow);
    const tokenRegistry = new PersistedWorkflowTokenRegistry();
    tokenRegistry.registerFromWorkflows([workflow]);
    const snapshot = new PersistedWorkflowSnapshotFactory(tokenRegistry).create(workflow);
    const snapshotDto = new PersistedWorkflowSnapshotMapper().map(snapshot);

    expect(snapshotDto).toEqual(liveDto);
  });
});
