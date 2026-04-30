import { describe, expect, it } from "vitest";
import type { ExecutionNode } from "../../src/features/workflows/lib/workflowDetail/workflowDetailTypes";
import { ExecutionTreeItemGroupInjector } from "../../src/features/workflows/lib/workflowDetail/ExecutionTreeItemGroupInjector";

const RUN_ID = "run_inject_test";
const WORKFLOW_ID = "wf.inject_test";
const AGENT_NODE_ID = "AIAgentNode:1";
const AGENT_ACTIVATION_ID = "act_orch_1";
const LLM_NODE_ID = "AIAgentNode:1__conn__llm";
const TOOL_NODE_ID = "AIAgentNode:1__conn__tool__conn__search";

function makeAgentExecutionNode(): ExecutionNode {
  return {
    node: {
      id: AGENT_NODE_ID,
      kind: "node",
      type: "AIAgent",
      name: "Mail orchestrator",
      role: "agent",
    } as unknown as ExecutionNode["node"],
    snapshot: {
      runId: RUN_ID,
      workflowId: WORKFLOW_ID,
      nodeId: AGENT_NODE_ID,
      activationId: AGENT_ACTIVATION_ID,
      status: "running",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    workflowNodeId: AGENT_NODE_ID,
  };
}

function makeInvocationExecutionNode(args: {
  invocationId: string;
  iterationId: string | undefined;
  itemIndex: number | undefined;
  startedAt: string;
  connectionNodeId: string;
}): ExecutionNode {
  const status = "completed" as const;
  return {
    node: {
      id: args.invocationId,
      kind: "node",
      type: "OpenAiChatModel",
      name: "OpenAI",
      role: args.connectionNodeId === LLM_NODE_ID ? "languageModel" : "tool",
    } as unknown as ExecutionNode["node"],
    snapshot: {
      runId: RUN_ID,
      workflowId: WORKFLOW_ID,
      nodeId: args.invocationId,
      activationId: AGENT_ACTIVATION_ID,
      parent: { runId: RUN_ID, workflowId: WORKFLOW_ID, nodeId: AGENT_NODE_ID },
      status,
      startedAt: args.startedAt,
      finishedAt: args.startedAt,
      updatedAt: args.startedAt,
    },
    workflowNodeId: args.connectionNodeId,
    workflowConnectionNodeId: args.connectionNodeId,
    parentInvocationId: AGENT_ACTIVATION_ID,
    iterationId: args.iterationId,
    itemIndex: args.itemIndex,
    parentAgentNodeId: AGENT_NODE_ID,
    parentAgentActivationId: AGENT_ACTIVATION_ID,
  };
}

describe("ExecutionTreeItemGroupInjector", () => {
  it("injects synthetic Item N rows when an agent processes 2+ items", () => {
    const agent = makeAgentExecutionNode();
    const invocations: ExecutionNode[] = [
      // Item 1: 1 LLM + 4 tool calls + 1 LLM
      makeInvocationExecutionNode({
        invocationId: "inv_llm_a",
        iterationId: "iter_a",
        itemIndex: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
        connectionNodeId: LLM_NODE_ID,
      }),
      makeInvocationExecutionNode({
        invocationId: "inv_tool_a1",
        iterationId: "iter_a",
        itemIndex: 0,
        startedAt: "2026-01-01T00:00:01.000Z",
        connectionNodeId: TOOL_NODE_ID,
      }),
      makeInvocationExecutionNode({
        invocationId: "inv_tool_a2",
        iterationId: "iter_a",
        itemIndex: 0,
        startedAt: "2026-01-01T00:00:02.000Z",
        connectionNodeId: TOOL_NODE_ID,
      }),
      // Item 2: 1 LLM + 4 tool calls + 1 LLM
      makeInvocationExecutionNode({
        invocationId: "inv_llm_b",
        iterationId: "iter_b",
        itemIndex: 1,
        startedAt: "2026-01-01T00:00:00.500Z",
        connectionNodeId: LLM_NODE_ID,
      }),
      makeInvocationExecutionNode({
        invocationId: "inv_tool_b1",
        iterationId: "iter_b",
        itemIndex: 1,
        startedAt: "2026-01-01T00:00:01.500Z",
        connectionNodeId: TOOL_NODE_ID,
      }),
    ];

    const injected = ExecutionTreeItemGroupInjector.inject([agent, ...invocations]);

    const itemGroupNodes = injected.filter((node) => node.isItemGroup === true);
    expect(itemGroupNodes).toHaveLength(2);
    expect(itemGroupNodes.map((node) => node.node.name)).toEqual(["Item 1", "Item 2"]);
    // Each Item row nests under the agent.
    for (const itemNode of itemGroupNodes) {
      expect(itemNode.snapshot?.parent?.nodeId).toBe(AGENT_NODE_ID);
    }
    // Every invocation now points at one of the synthetic Item rows.
    const invocationNodes = injected.filter((node) => node.workflowConnectionNodeId !== undefined);
    for (const invocation of invocationNodes) {
      const parentItem = itemGroupNodes.find((item) => item.node.id === invocation.parentInvocationId);
      expect(parentItem).toBeDefined();
    }
  });

  it("leaves the tree untouched when the agent only emitted ONE item", () => {
    const agent = makeAgentExecutionNode();
    const invocations: ExecutionNode[] = [
      makeInvocationExecutionNode({
        invocationId: "inv_llm_a",
        iterationId: "iter_a",
        itemIndex: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
        connectionNodeId: LLM_NODE_ID,
      }),
      makeInvocationExecutionNode({
        invocationId: "inv_tool_a1",
        iterationId: "iter_a",
        itemIndex: 0,
        startedAt: "2026-01-01T00:00:01.000Z",
        connectionNodeId: TOOL_NODE_ID,
      }),
    ];

    const injected = ExecutionTreeItemGroupInjector.inject([agent, ...invocations]);
    expect(injected.filter((node) => node.isItemGroup === true)).toHaveLength(0);
    // No invocations were re-parented.
    expect(
      injected.filter((node) => node.workflowConnectionNodeId !== undefined).map((node) => node.parentInvocationId),
    ).toEqual([AGENT_ACTIVATION_ID, AGENT_ACTIVATION_ID]);
  });

  it("leaves the tree untouched when the invocations have no iterationId (legacy runs)", () => {
    const agent = makeAgentExecutionNode();
    const invocations: ExecutionNode[] = [
      makeInvocationExecutionNode({
        invocationId: "inv_legacy_a",
        iterationId: undefined,
        itemIndex: undefined,
        startedAt: "2026-01-01T00:00:00.000Z",
        connectionNodeId: LLM_NODE_ID,
      }),
      makeInvocationExecutionNode({
        invocationId: "inv_legacy_b",
        iterationId: undefined,
        itemIndex: undefined,
        startedAt: "2026-01-01T00:00:01.000Z",
        connectionNodeId: TOOL_NODE_ID,
      }),
    ];

    const injected = ExecutionTreeItemGroupInjector.inject([agent, ...invocations]);
    expect(injected.filter((node) => node.isItemGroup === true)).toHaveLength(0);
  });

  it("does NOT touch sub-agent invocations whose parentInvocationId points at a tool-call row", () => {
    const agent = makeAgentExecutionNode();
    const orchestratorInvocations: ExecutionNode[] = [
      makeInvocationExecutionNode({
        invocationId: "inv_llm_a",
        iterationId: "iter_a",
        itemIndex: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
        connectionNodeId: LLM_NODE_ID,
      }),
      makeInvocationExecutionNode({
        invocationId: "inv_tool_a1",
        iterationId: "iter_a",
        itemIndex: 0,
        startedAt: "2026-01-01T00:00:01.000Z",
        connectionNodeId: TOOL_NODE_ID,
      }),
      makeInvocationExecutionNode({
        invocationId: "inv_llm_b",
        iterationId: "iter_b",
        itemIndex: 1,
        startedAt: "2026-01-01T00:00:00.500Z",
        connectionNodeId: LLM_NODE_ID,
      }),
    ];
    // Sub-agent's LLM call sits under the orchestrator's tool call (parentInvocationId).
    const subAgentLlm: ExecutionNode = {
      ...makeInvocationExecutionNode({
        invocationId: "inv_subllm_1",
        iterationId: "iter_sub_1",
        itemIndex: 0,
        startedAt: "2026-01-01T00:00:01.500Z",
        connectionNodeId: "AIAgentNode:1__conn__tool__conn__search__conn__llm",
      }),
      parentInvocationId: "inv_tool_a1",
    };

    const injected = ExecutionTreeItemGroupInjector.inject([agent, ...orchestratorInvocations, subAgentLlm]);

    // Sub-agent invocation's parentInvocationId stays pointed at the orchestrator's tool call,
    // not re-parented onto a synthetic Item row.
    const subAgentEntry = injected.find((node) => node.node.id === "inv_subllm_1");
    expect(subAgentEntry?.parentInvocationId).toBe("inv_tool_a1");
  });
});
