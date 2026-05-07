import { describe, expect, it } from "vitest";
import { PersistedWorkflowSnapshotMapper } from "../../src/features/workflows/lib/workflowDetail/PersistedWorkflowSnapshotMapper";
import type { PersistedWorkflowSnapshot } from "../../src/features/workflows/lib/realtime/realtimeDomainTypes";

const mapper = new PersistedWorkflowSnapshotMapper();

function snapshotWithNode(nodeConfig: Record<string, unknown>): PersistedWorkflowSnapshot {
  return {
    id: "wf.test",
    name: "Test workflow",
    workflowErrorHandlerConfigured: false,
    nodes: [
      {
        id: "node_1",
        kind: "node",
        nodeTokenId: "SubWorkflow",
        configTokenId: "SubWorkflow",
        config: nodeConfig,
      },
    ],
    edges: [],
  };
}

describe("PersistedWorkflowSnapshotMapper referencedWorkflowId", () => {
  it("maps referencedWorkflowId when snapshot node config has a non-empty workflowId", () => {
    const dto = mapper.map(snapshotWithNode({ workflowId: "wf.target" }));
    const node = dto.nodes.find((n) => n.id === "node_1");
    expect(node?.referencedWorkflowId).toBe("wf.target");
  });

  it("omits referencedWorkflowId when snapshot node config has no workflowId", () => {
    const dto = mapper.map(snapshotWithNode({}));
    const node = dto.nodes.find((n) => n.id === "node_1");
    expect(node).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(node, "referencedWorkflowId")).toBe(false);
  });

  it("omits referencedWorkflowId when workflowId is an empty string", () => {
    const dto = mapper.map(snapshotWithNode({ workflowId: "" }));
    const node = dto.nodes.find((n) => n.id === "node_1");
    expect(Object.prototype.hasOwnProperty.call(node, "referencedWorkflowId")).toBe(false);
  });

  it("omits referencedWorkflowId when workflowId is a whitespace-only string", () => {
    const dto = mapper.map(snapshotWithNode({ workflowId: "   " }));
    const node = dto.nodes.find((n) => n.id === "node_1");
    expect(Object.prototype.hasOwnProperty.call(node, "referencedWorkflowId")).toBe(false);
  });

  it("does not populate referencedWorkflowId on connection-child nodes", () => {
    const snapshot: PersistedWorkflowSnapshot = {
      id: "wf.agent",
      name: "Agent workflow",
      workflowErrorHandlerConfigured: false,
      nodes: [
        {
          id: "agent_1",
          kind: "node",
          nodeTokenId: "AgentNode",
          configTokenId: "AgentNode",
          config: { workflowId: "wf.child" },
        },
        {
          id: "tool_1",
          kind: "node",
          nodeTokenId: "SubWorkflow",
          configTokenId: "SubWorkflow",
          config: { workflowId: "wf.should-not-appear" },
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

    const dto = mapper.map(snapshot);
    const connectionChildNode = dto.nodes.find((n) => n.id === "tool_1");
    expect(connectionChildNode).toBeDefined();
    expect(connectionChildNode?.parentNodeId).toBe("agent_1");
    expect(Object.prototype.hasOwnProperty.call(connectionChildNode, "referencedWorkflowId")).toBe(false);
  });
});
