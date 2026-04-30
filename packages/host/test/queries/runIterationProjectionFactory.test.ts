import type { ExecutionInstanceDto } from "@codemation/core";
import { describe, expect, it } from "vitest";
import { RunIterationProjectionFactory } from "../../src/application/queries/RunIterationProjectionFactory";

function buildInvocation(
  args: Partial<ExecutionInstanceDto> & Pick<ExecutionInstanceDto, "instanceId">,
): ExecutionInstanceDto {
  return {
    instanceId: args.instanceId,
    slotNodeId: args.slotNodeId ?? "agent.llm",
    workflowNodeId: args.workflowNodeId ?? "agent",
    parentInstanceId: args.parentInstanceId,
    kind: "connectionInvocation",
    connectionKind: args.connectionKind ?? "languageModel",
    runIndex: args.runIndex ?? 0,
    batchId: args.batchId ?? "batch_1",
    activationId: args.activationId ?? "act_1",
    status: args.status ?? "completed",
    queuedAt: args.queuedAt,
    startedAt: args.startedAt,
    finishedAt: args.finishedAt,
    itemCount: 0,
    inputJson: args.inputJson,
    outputJson: args.outputJson,
    error: args.error,
    iterationId: args.iterationId,
    itemIndex: args.itemIndex,
    parentInvocationId: args.parentInvocationId,
  };
}

describe("RunIterationProjectionFactory", () => {
  const factory = new RunIterationProjectionFactory();

  it("groups invocations by iterationId and orders by itemIndex", () => {
    const instances: ExecutionInstanceDto[] = [
      buildInvocation({
        instanceId: "inv-2",
        iterationId: "iter_b",
        itemIndex: 1,
        startedAt: "2026-04-30T10:00:01Z",
        finishedAt: "2026-04-30T10:00:02Z",
      }),
      buildInvocation({
        instanceId: "inv-1",
        iterationId: "iter_a",
        itemIndex: 0,
        startedAt: "2026-04-30T10:00:00Z",
        finishedAt: "2026-04-30T10:00:01Z",
      }),
      buildInvocation({
        instanceId: "inv-3",
        iterationId: "iter_a",
        itemIndex: 0,
        startedAt: "2026-04-30T10:00:01Z",
        finishedAt: "2026-04-30T10:00:02Z",
        connectionKind: "tool",
      }),
    ];

    const iterations = factory.project(instances);

    expect(iterations).toHaveLength(2);
    expect(iterations[0]?.iterationId).toBe("iter_a");
    expect(iterations[0]?.itemIndex).toBe(0);
    expect(iterations[0]?.invocationIds).toEqual(["inv-1", "inv-3"]);
    expect(iterations[0]?.startedAt).toBe("2026-04-30T10:00:00Z");
    expect(iterations[0]?.finishedAt).toBe("2026-04-30T10:00:02Z");
    expect(iterations[0]?.status).toBe("completed");

    expect(iterations[1]?.iterationId).toBe("iter_b");
    expect(iterations[1]?.itemIndex).toBe(1);
    expect(iterations[1]?.invocationIds).toEqual(["inv-2"]);
  });

  it("propagates parentInvocationId from sub-agent iterations", () => {
    const instances: ExecutionInstanceDto[] = [
      buildInvocation({
        instanceId: "orchestrator-tool-call",
        iterationId: "iter_outer",
        itemIndex: 0,
        connectionKind: "tool",
        startedAt: "2026-04-30T10:00:00Z",
        finishedAt: "2026-04-30T10:00:05Z",
      }),
      buildInvocation({
        instanceId: "subagent-llm",
        iterationId: "iter_inner",
        itemIndex: 0,
        parentInvocationId: "orchestrator-tool-call",
        connectionKind: "languageModel",
        workflowNodeId: "subagent",
        startedAt: "2026-04-30T10:00:01Z",
        finishedAt: "2026-04-30T10:00:04Z",
      }),
    ];

    const iterations = factory.project(instances);

    const outer = iterations.find((iteration) => iteration.iterationId === "iter_outer");
    const inner = iterations.find((iteration) => iteration.iterationId === "iter_inner");
    expect(outer?.parentInvocationId).toBeUndefined();
    expect(inner?.parentInvocationId).toBe("orchestrator-tool-call");
    expect(inner?.agentNodeId).toBe("subagent");
  });

  it("aggregates status: failed > running > completed", () => {
    const instances: ExecutionInstanceDto[] = [
      buildInvocation({ instanceId: "inv-1", iterationId: "iter_x", itemIndex: 0, status: "completed" }),
      buildInvocation({ instanceId: "inv-2", iterationId: "iter_x", itemIndex: 0, status: "failed" }),
      buildInvocation({ instanceId: "inv-3", iterationId: "iter_y", itemIndex: 1, status: "running" }),
      buildInvocation({ instanceId: "inv-4", iterationId: "iter_y", itemIndex: 1, status: "completed" }),
    ];

    const iterations = factory.project(instances);
    expect(iterations.find((iteration) => iteration.iterationId === "iter_x")?.status).toBe("failed");
    expect(iterations.find((iteration) => iteration.iterationId === "iter_y")?.status).toBe("running");
  });

  it("falls back to grouping by activationId for legacy runs without iterationId", () => {
    const instances: ExecutionInstanceDto[] = [
      buildInvocation({ instanceId: "inv-1", activationId: "act_legacy", itemIndex: 0 }),
      buildInvocation({ instanceId: "inv-2", activationId: "act_legacy", itemIndex: 0 }),
    ];

    const iterations = factory.project(instances);
    expect(iterations).toHaveLength(1);
    expect(iterations[0]?.invocationIds).toEqual(["inv-1", "inv-2"]);
  });

  it("returns an empty array when there are no connection invocations", () => {
    const instances: ExecutionInstanceDto[] = [
      {
        instanceId: "node-1",
        slotNodeId: "agent",
        workflowNodeId: "agent",
        kind: "workflowNodeActivation",
        runIndex: 1,
        batchId: "batch_1",
        status: "completed",
        itemCount: 1,
      },
    ];
    expect(factory.project(instances)).toEqual([]);
  });
});
