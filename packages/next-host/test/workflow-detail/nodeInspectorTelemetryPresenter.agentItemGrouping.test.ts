import { describe, expect, it } from "vitest";
import type {
  ConnectionInvocationRecord,
  TelemetryRunTraceViewDto,
} from "../../src/features/workflows/hooks/realtime/realtime";
import { NodeInspectorTelemetryPresenter } from "../../src/features/workflows/lib/workflowDetail/NodeInspectorTelemetryPresenter";

const TRACE_ID = "trace_agent_items";
const RUN_ID = "run_agent_items";
const WORKFLOW_ID = "wf.agent_items";
const AGENT_NODE_ID = "AIAgentNode:1";
const LLM_NODE_ID = "AIAgentNode:1__conn__llm";

function makeLlmSpan(args: {
  spanId: string;
  iterationId: string | undefined;
  itemIndex: number | undefined;
  startTime: string;
}): TelemetryRunTraceViewDto["spans"][number] {
  return {
    traceId: TRACE_ID,
    spanId: args.spanId,
    runId: RUN_ID,
    workflowId: WORKFLOW_ID,
    nodeId: AGENT_NODE_ID,
    name: "gen_ai.chat.completion",
    kind: "client",
    status: "completed",
    startTime: args.startTime,
    endTime: args.startTime,
    modelName: "gpt-4o",
    iterationId: args.iterationId,
    itemIndex: args.itemIndex,
  };
}

function makeToolSpan(args: {
  spanId: string;
  parentSpanId: string;
  iterationId: string | undefined;
  itemIndex: number | undefined;
  startTime: string;
}): TelemetryRunTraceViewDto["spans"][number] {
  return {
    traceId: TRACE_ID,
    spanId: args.spanId,
    parentSpanId: args.parentSpanId,
    runId: RUN_ID,
    workflowId: WORKFLOW_ID,
    nodeId: AGENT_NODE_ID,
    name: "agent.tool.call",
    kind: "client",
    status: "completed",
    startTime: args.startTime,
    endTime: args.startTime,
    iterationId: args.iterationId,
    itemIndex: args.itemIndex,
    attributes: { "codemation.tool.name": "searchInMail" },
  };
}

function makeInvocation(args: {
  invocationId: string;
  iterationId: string;
  itemIndex: number;
  startedAt: string;
}): ConnectionInvocationRecord {
  return {
    invocationId: args.invocationId,
    runId: RUN_ID,
    workflowId: WORKFLOW_ID,
    connectionNodeId: LLM_NODE_ID,
    parentAgentNodeId: AGENT_NODE_ID,
    parentAgentActivationId: "act_orch_1",
    status: "completed",
    iterationId: args.iterationId,
    itemIndex: args.itemIndex,
    startedAt: args.startedAt,
    updatedAt: args.startedAt,
  };
}

describe("NodeInspectorTelemetryPresenter agent timeline – per-item grouping", () => {
  it("groups LLM and tool spans by iterationId into Item N parent entries when the agent ran 2+ items", () => {
    const traceView: TelemetryRunTraceViewDto = {
      traceId: TRACE_ID,
      runId: RUN_ID,
      spans: [
        makeLlmSpan({
          spanId: "span_llm_a1",
          iterationId: "iter_a",
          itemIndex: 0,
          startTime: "2026-01-01T00:00:00.000Z",
        }),
        makeToolSpan({
          spanId: "span_tool_a1",
          parentSpanId: "span_llm_a1",
          iterationId: "iter_a",
          itemIndex: 0,
          startTime: "2026-01-01T00:00:01.000Z",
        }),
        makeLlmSpan({
          spanId: "span_llm_a2",
          iterationId: "iter_a",
          itemIndex: 0,
          startTime: "2026-01-01T00:00:02.000Z",
        }),
        makeLlmSpan({
          spanId: "span_llm_b1",
          iterationId: "iter_b",
          itemIndex: 1,
          startTime: "2026-01-01T00:00:00.500Z",
        }),
        makeToolSpan({
          spanId: "span_tool_b1",
          parentSpanId: "span_llm_b1",
          iterationId: "iter_b",
          itemIndex: 1,
          startTime: "2026-01-01T00:00:01.500Z",
        }),
      ],
      artifacts: [],
      metricPoints: [],
    };

    const model = NodeInspectorTelemetryPresenter.create({
      node: {
        id: AGENT_NODE_ID,
        kind: "node",
        type: "AIAgent",
        name: "Mail orchestrator",
        role: "agent",
      },
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [],
      traceView,
    });

    const section = model.sections.find((s) => s.id === "agent-timeline");
    expect(section).toBeDefined();
    expect(section?.timeline).toHaveLength(2);
    expect(section?.timeline?.[0]?.title).toBe("Item 1");
    expect(section?.timeline?.[1]?.title).toBe("Item 2");
    // Item 1 has 2 LLM rounds (one with a nested tool call) — children should reflect that.
    expect(section?.timeline?.[0]?.children?.length).toBe(2);
    expect(section?.timeline?.[1]?.children?.length).toBe(1);
  });

  it("falls back to the flat (legacy) layout when telemetry has no iterationId", () => {
    const traceView: TelemetryRunTraceViewDto = {
      traceId: TRACE_ID,
      runId: RUN_ID,
      spans: [
        makeLlmSpan({
          spanId: "span_llm_legacy",
          iterationId: undefined,
          itemIndex: undefined,
          startTime: "2026-01-01T00:00:00.000Z",
        }),
      ],
      artifacts: [],
      metricPoints: [],
    };
    const model = NodeInspectorTelemetryPresenter.create({
      node: {
        id: AGENT_NODE_ID,
        kind: "node",
        type: "AIAgent",
        name: "Mail orchestrator",
        role: "agent",
      },
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [],
      traceView,
    });
    const section = model.sections.find((s) => s.id === "agent-timeline");
    // Single legacy LLM span renders directly (not wrapped in an Item N row).
    expect(section?.timeline?.[0]?.title).toContain("Model call");
  });

  it("focused-item mode shows only the matching Item subtree and per-item nav when the agent has 2+ items", () => {
    const traceView: TelemetryRunTraceViewDto = {
      traceId: TRACE_ID,
      runId: RUN_ID,
      spans: [
        makeLlmSpan({
          spanId: "span_llm_a1",
          iterationId: "iter_a",
          itemIndex: 0,
          startTime: "2026-01-01T00:00:00.000Z",
        }),
        makeLlmSpan({
          spanId: "span_llm_b1",
          iterationId: "iter_b",
          itemIndex: 1,
          startTime: "2026-01-01T00:00:01.000Z",
        }),
      ],
      artifacts: [],
      metricPoints: [],
    };
    const invocations: ConnectionInvocationRecord[] = [
      makeInvocation({
        invocationId: "inv_a1",
        iterationId: "iter_a",
        itemIndex: 0,
        startedAt: "2026-01-01T00:00:00.000Z",
      }),
      makeInvocation({
        invocationId: "inv_b1",
        iterationId: "iter_b",
        itemIndex: 1,
        startedAt: "2026-01-01T00:00:01.000Z",
      }),
    ];

    const model = NodeInspectorTelemetryPresenter.create({
      node: {
        id: AGENT_NODE_ID,
        kind: "node",
        type: "AIAgent",
        name: "Mail orchestrator",
        role: "agent",
      },
      nodeSnapshotsByNodeId: {},
      connectionInvocations: invocations,
      traceView,
      focusedInvocationId: "inv_a1",
    });

    const section = model.sections.find((s) => s.id === "agent-timeline");
    expect(section?.breadcrumb?.text).toBe("Item 1 of 2");
    expect(section?.timeline).toHaveLength(1);
    expect(section?.timeline?.[0]?.title).toBe("Item 1");
    expect(section?.navigation?.next?.invocationId).toBe("inv_b1");
    expect(section?.navigation?.prev).toBeNull();
  });
});
