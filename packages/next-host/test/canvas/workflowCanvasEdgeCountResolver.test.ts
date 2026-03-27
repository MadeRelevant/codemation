import { describe, expect, it } from "vitest";

import { WorkflowCanvasEdgeCountResolver } from "../../src/features/workflows/components/canvas/lib/WorkflowCanvasEdgeCountResolver";

describe("WorkflowCanvasEdgeCountResolver", () => {
  it("counts distinct connection invocations for a language model attachment edge", () => {
    const llmNodeId = "llm-1";
    const count = WorkflowCanvasEdgeCountResolver.resolveCount({
      targetNodeId: llmNodeId,
      targetNodeRole: "languageModel",
      targetInput: "main",
      sourceOutput: "main",
      sourceSnapshot: undefined,
      targetSnapshot: {
        runId: "r1",
        workflowId: "w1",
        nodeId: llmNodeId,
        status: "completed",
        updatedAt: "2026-03-11T12:00:00.000Z",
      },
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [
        {
          invocationId: "a",
          runId: "r1",
          workflowId: "w1",
          connectionNodeId: llmNodeId,
          parentAgentNodeId: "agent",
          parentAgentActivationId: "act",
          status: "completed",
          updatedAt: "2026-03-11T12:00:05.000Z",
        },
        {
          invocationId: "b",
          runId: "r1",
          workflowId: "w1",
          connectionNodeId: llmNodeId,
          parentAgentNodeId: "agent",
          parentAgentActivationId: "act",
          status: "completed",
          updatedAt: "2026-03-11T12:00:10.000Z",
        },
      ],
    });
    expect(count).toBe(2);
  });
});
