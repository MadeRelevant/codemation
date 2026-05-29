import { describe, expect, it } from "vitest";
import type { WorkflowDto, ConnectionInvocationRecord } from "../../src/realtime/realtimeDomainTypes";
import { WorkflowDetailPresenter } from "../../src/lib/workflowDetail/WorkflowDetailPresenter";

const AGENT_NODE_ID = "agent-1";
const MCP_NODE_ID = "agent-1__conn__mcp__conn__gmail";

function makeWorkflow(): WorkflowDto {
  return {
    id: "wf1",
    name: "W",
    active: true,
    nodes: [
      { id: AGENT_NODE_ID, name: "Agent", type: "AIAgentNode", kind: "node", role: "agent" } as never,
      // MCP connection node: same shape AgentConnectionNodeCollector emits.
      {
        id: MCP_NODE_ID,
        name: "Gmail",
        type: "gmail",
        kind: "node",
        role: "tool",
        parentNodeId: AGENT_NODE_ID,
      } as never,
    ],
    edges: [],
  };
}

function makeInvocation(
  invocationId: string,
  overrides: Partial<ConnectionInvocationRecord>,
): ConnectionInvocationRecord {
  return {
    invocationId,
    runId: "run-1",
    workflowId: "wf1",
    connectionNodeId: MCP_NODE_ID,
    parentAgentNodeId: AGENT_NODE_ID,
    parentAgentActivationId: "act-1",
    status: "completed",
    updatedAt: "2026-05-23T17:00:00.000Z",
    ...overrides,
  };
}

describe("WorkflowDetailPresenter — subjectName on invocation execution nodes", () => {
  it("overrides the synthesized invocation node's name with subjectName when present (MCP tool calls)", () => {
    const workflow = makeWorkflow();
    const nodes = WorkflowDetailPresenter.buildExecutionNodes(workflow, {
      mutableState: { runQueue: [] } as never,
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [
        makeInvocation("inv-search", { subjectName: "search_threads" }),
        makeInvocation("inv-send", { subjectName: "send_email", updatedAt: "2026-05-23T17:01:00.000Z" }),
      ],
    });

    const invocationNames = nodes.filter((n) => n.workflowConnectionNodeId === MCP_NODE_ID).map((n) => n.node.name);
    expect(invocationNames).toContain("search_threads");
    expect(invocationNames).toContain("send_email");
  });

  it("inherits the base node's name when subjectName is unset (LLM/tool nodes that own their identity)", () => {
    const workflow = makeWorkflow();
    const nodes = WorkflowDetailPresenter.buildExecutionNodes(workflow, {
      mutableState: { runQueue: [] } as never,
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [makeInvocation("inv-plain", {})],
    });

    const inv = nodes.find((n) => n.workflowConnectionNodeId === MCP_NODE_ID);
    expect(inv).toBeDefined();
    // Base node's name is "Gmail" — unchanged when subjectName is absent.
    expect(inv?.node.name).toBe("Gmail");
  });
});
