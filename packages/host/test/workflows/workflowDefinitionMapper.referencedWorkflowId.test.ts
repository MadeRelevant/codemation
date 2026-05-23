import { AllWorkflowsActiveWorkflowActivationPolicy, type WorkflowDefinition } from "@codemation/core";
import { describe, expect, it } from "vitest";

import { WorkflowDefinitionMapper } from "../../src/application/mapping/WorkflowDefinitionMapper";
import { WorkflowPolicyUiPresentationFactory } from "../../src/application/mapping/WorkflowPolicyUiPresentationFactory";
import type { McpServerCatalog } from "../../src/mcp/McpServerCatalog";

const mapper = new WorkflowDefinitionMapper(
  new WorkflowPolicyUiPresentationFactory(),
  new AllWorkflowsActiveWorkflowActivationPolicy(),
  { get: () => undefined } as unknown as McpServerCatalog,
);

class SubWorkflowToken {}

function workflowWithNode(nodeConfig: Record<string, unknown>): WorkflowDefinition {
  return {
    id: "wf.test",
    name: "Test workflow",
    nodes: [
      {
        id: "node_1",
        kind: "node",
        type: SubWorkflowToken,
        config: nodeConfig as never,
      },
    ],
    edges: [],
  };
}

describe("WorkflowDefinitionMapper referencedWorkflowId", () => {
  it("maps referencedWorkflowId when node config has a non-empty workflowId", () => {
    const dto = mapper.mapSync(workflowWithNode({ workflowId: "wf.target" }));
    const node = dto.nodes.find((n) => n.id === "node_1");
    expect(node?.referencedWorkflowId).toBe("wf.target");
  });

  it("omits referencedWorkflowId when node config has no workflowId", () => {
    const dto = mapper.mapSync(workflowWithNode({}));
    const node = dto.nodes.find((n) => n.id === "node_1");
    expect(node).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(node, "referencedWorkflowId")).toBe(false);
  });

  it("omits referencedWorkflowId when workflowId is an empty string", () => {
    const dto = mapper.mapSync(workflowWithNode({ workflowId: "" }));
    const node = dto.nodes.find((n) => n.id === "node_1");
    expect(Object.prototype.hasOwnProperty.call(node, "referencedWorkflowId")).toBe(false);
  });

  it("omits referencedWorkflowId when workflowId is a whitespace-only string", () => {
    const dto = mapper.mapSync(workflowWithNode({ workflowId: "   " }));
    const node = dto.nodes.find((n) => n.id === "node_1");
    expect(Object.prototype.hasOwnProperty.call(node, "referencedWorkflowId")).toBe(false);
  });

  it("does not populate referencedWorkflowId on connection-child nodes", () => {
    class AgentToken {}
    const workflow: WorkflowDefinition = {
      id: "wf.agent",
      name: "Agent workflow",
      nodes: [
        {
          id: "agent_1",
          kind: "node",
          type: AgentToken,
          config: { workflowId: "wf.child" } as never,
        },
        {
          id: "tool_1",
          kind: "node",
          type: SubWorkflowToken,
          config: { workflowId: "wf.should-not-appear" } as never,
        },
      ],
      edges: [],
      connections: [
        {
          parentNodeId: "agent_1",
          connectionName: "tool",
          childNodeIds: ["tool_1"],
        },
      ],
    };

    const dto = mapper.mapSync(workflow);
    const connectionChildNode = dto.nodes.find((n) => n.id === "tool_1");
    expect(connectionChildNode).toBeDefined();
    expect(connectionChildNode?.parentNodeId).toBe("agent_1");
    expect(Object.prototype.hasOwnProperty.call(connectionChildNode, "referencedWorkflowId")).toBe(false);
  });
});
