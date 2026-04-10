import { AllWorkflowsActiveWorkflowActivationPolicy, type AnyRunnableNodeConfig } from "@codemation/core";
import { createWorkflowBuilder } from "@codemation/core-nodes";
import { describe, expect, it } from "vitest";

import { WorkflowDefinitionMapper } from "../../src/application/mapping/WorkflowDefinitionMapper";
import { WorkflowPolicyUiPresentationFactory } from "../../src/application/mapping/WorkflowPolicyUiPresentationFactory";

describe("WorkflowDefinitionMapper declared ports", () => {
  it("maps declared input/output ports from node config onto WorkflowNodeDto", () => {
    class ErrorPortNodeToken {}

    const wf = createWorkflowBuilder({
      id: "wf.host.declared-ports",
      name: "Declared ports mapping",
    })
      .start({
        kind: "node",
        type: ErrorPortNodeToken,
        name: "Emits errors",
        declaredOutputPorts: ["main", "error"],
        declaredInputPorts: ["in"],
        id: "node_1",
      } as AnyRunnableNodeConfig)
      .build();

    const dto = new WorkflowDefinitionMapper(
      new WorkflowPolicyUiPresentationFactory(),
      new AllWorkflowsActiveWorkflowActivationPolicy(),
    ).mapSync(wf);

    const nodeDto = dto.nodes.find((n) => n.id === "node_1");
    expect(nodeDto?.declaredOutputPorts).toEqual(["main", "error"]);
    expect(nodeDto?.declaredInputPorts).toEqual(["in"]);
  });
});
