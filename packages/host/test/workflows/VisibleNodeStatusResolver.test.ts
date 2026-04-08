import assert from "node:assert/strict";
import { test } from "vitest";

import { VisibleNodeStatusResolver } from "@codemation/next-host/src/features/workflows/components/canvas/VisibleNodeStatusResolver";
import type {
  ConnectionInvocationRecord,
  NodeExecutionSnapshot,
} from "@codemation/next-host/src/features/workflows/hooks/realtime/realtime";

class VisibleNodeStatusResolverFixture {
  static readonly runId = "run-1";
  static readonly workflowId = "wf-1";
  static readonly llmNodeId = "agent__conn__llm";

  static createSnapshot(status: NodeExecutionSnapshot["status"], updatedAt: string): NodeExecutionSnapshot {
    return {
      runId: this.runId,
      workflowId: this.workflowId,
      nodeId: this.llmNodeId,
      status,
      updatedAt,
    };
  }

  static createInvocation(
    status: NodeExecutionSnapshot["status"],
    updatedAt: string,
    invocationId: string,
  ): ConnectionInvocationRecord {
    return {
      invocationId,
      runId: this.runId,
      workflowId: this.workflowId,
      connectionNodeId: this.llmNodeId,
      parentAgentNodeId: "agent",
      parentAgentActivationId: "act-1",
      status,
      updatedAt,
    };
  }
}

test("VisibleNodeStatusResolver keeps a currently running snapshot over older completed invocation history", () => {
  const result = VisibleNodeStatusResolver.resolveStatuses(
    {
      [VisibleNodeStatusResolverFixture.llmNodeId]: VisibleNodeStatusResolverFixture.createSnapshot(
        "running",
        "2026-04-07T10:00:10.000Z",
      ),
    },
    [VisibleNodeStatusResolverFixture.createInvocation("completed", "2026-04-07T10:00:05.000Z", "inv-1")],
  );

  assert.equal(result[VisibleNodeStatusResolverFixture.llmNodeId], "running");
});
