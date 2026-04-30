import { describe, expect, it } from "vitest";
import type { TelemetryRunTraceViewDto } from "../../src/features/workflows/hooks/realtime/realtime";
import { NodeInspectorTelemetryPresenter } from "../../src/features/workflows/lib/workflowDetail/NodeInspectorTelemetryPresenter";

const TRACE_ID = "trace_parent_span_test";
const RUN_ID = "run_parent_span_test";
const WORKFLOW_ID = "wf.parent_span_test";

describe("NodeInspectorTelemetryPresenter – agent timeline nesting via parentSpanId", () => {
  it("nests tool calls under the LLM round whose spanId matches the tool's parentSpanId, not by time", () => {
    // Two LLM rounds overlap in time. The tool call's parentSpanId points to the EARLIER round
    // (span_llm_1) even though the tool call's startTime is closer to the later round.
    const traceView: TelemetryRunTraceViewDto = {
      traceId: TRACE_ID,
      runId: RUN_ID,
      spans: [
        {
          traceId: TRACE_ID,
          spanId: "span_llm_1",
          runId: RUN_ID,
          workflowId: WORKFLOW_ID,
          nodeId: "agent_main",
          name: "gen_ai.chat.completion",
          kind: "client",
          status: "completed",
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:00:05.000Z",
          modelName: "gpt-4o",
        },
        {
          traceId: TRACE_ID,
          spanId: "span_llm_2",
          runId: RUN_ID,
          workflowId: WORKFLOW_ID,
          nodeId: "agent_main",
          name: "gen_ai.chat.completion",
          kind: "client",
          status: "completed",
          startTime: "2026-01-01T00:00:01.000Z",
          endTime: "2026-01-01T00:00:06.000Z",
          modelName: "gpt-4o",
        },
        {
          traceId: TRACE_ID,
          spanId: "span_tool_call",
          parentSpanId: "span_llm_1",
          runId: RUN_ID,
          workflowId: WORKFLOW_ID,
          nodeId: "agent_main",
          name: "agent.tool.call",
          kind: "client",
          status: "completed",
          startTime: "2026-01-01T00:00:02.000Z",
          endTime: "2026-01-01T00:00:03.000Z",
          attributes: { "codemation.tool.name": "searchInMail" },
        },
      ],
      artifacts: [],
      metricPoints: [],
    };

    const model = NodeInspectorTelemetryPresenter.create({
      node: {
        id: "agent_main",
        kind: "node",
        type: "AIAgent",
        name: "agent",
        role: "agent",
      },
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [],
      traceView,
    });

    const timeline = model.sections.find((s) => s.id === "agent-timeline");
    expect(timeline?.timeline).toHaveLength(2);
    const firstLlm = timeline?.timeline?.find((entry) => entry.key === "span_llm_1");
    const secondLlm = timeline?.timeline?.find((entry) => entry.key === "span_llm_2");
    expect(firstLlm?.children).toHaveLength(1);
    expect(firstLlm?.children?.[0]?.key).toBe("span_tool_call");
    expect(secondLlm?.children).toBeUndefined();
  });

  it("walks the parentSpanId chain through intermediate spans to reach an LLM round", () => {
    const traceView: TelemetryRunTraceViewDto = {
      traceId: TRACE_ID,
      runId: RUN_ID,
      spans: [
        {
          traceId: TRACE_ID,
          spanId: "span_llm_outer",
          runId: RUN_ID,
          workflowId: WORKFLOW_ID,
          nodeId: "agent_main",
          name: "gen_ai.chat.completion",
          kind: "client",
          status: "completed",
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:00:10.000Z",
          modelName: "gpt-4o",
        },
        {
          traceId: TRACE_ID,
          spanId: "span_intermediate",
          parentSpanId: "span_llm_outer",
          runId: RUN_ID,
          workflowId: WORKFLOW_ID,
          nodeId: "agent_main",
          name: "agent.tool.dispatch",
          kind: "internal",
          status: "completed",
          startTime: "2026-01-01T00:00:01.000Z",
          endTime: "2026-01-01T00:00:09.000Z",
        },
        {
          traceId: TRACE_ID,
          spanId: "span_tool_nested",
          parentSpanId: "span_intermediate",
          runId: RUN_ID,
          workflowId: WORKFLOW_ID,
          nodeId: "agent_main",
          name: "agent.tool.call",
          kind: "client",
          status: "completed",
          startTime: "2026-01-01T00:00:02.000Z",
          endTime: "2026-01-01T00:00:08.000Z",
          attributes: { "codemation.tool.name": "searchInMail" },
        },
      ],
      artifacts: [],
      metricPoints: [],
    };

    const model = NodeInspectorTelemetryPresenter.create({
      node: {
        id: "agent_main",
        kind: "node",
        type: "AIAgent",
        name: "agent",
        role: "agent",
      },
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [],
      traceView,
    });

    const timeline = model.sections.find((s) => s.id === "agent-timeline");
    expect(timeline?.timeline).toHaveLength(1);
    const llm = timeline?.timeline?.[0];
    expect(llm?.key).toBe("span_llm_outer");
    expect(llm?.children).toHaveLength(1);
    expect(llm?.children?.[0]?.key).toBe("span_tool_nested");
  });

  it("surfaces tool calls whose parent chain doesn't reach any LLM round as orphan top-level entries", () => {
    const traceView: TelemetryRunTraceViewDto = {
      traceId: TRACE_ID,
      runId: RUN_ID,
      spans: [
        {
          traceId: TRACE_ID,
          spanId: "span_llm",
          runId: RUN_ID,
          workflowId: WORKFLOW_ID,
          nodeId: "agent_main",
          name: "gen_ai.chat.completion",
          kind: "client",
          status: "completed",
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:00:05.000Z",
          modelName: "gpt-4o",
        },
        {
          traceId: TRACE_ID,
          spanId: "span_orphan_tool",
          parentSpanId: "span_unknown",
          runId: RUN_ID,
          workflowId: WORKFLOW_ID,
          nodeId: "agent_main",
          name: "agent.tool.call",
          kind: "client",
          status: "completed",
          startTime: "2026-01-01T00:00:01.000Z",
          endTime: "2026-01-01T00:00:02.000Z",
          attributes: { "codemation.tool.name": "orphanTool" },
        },
      ],
      artifacts: [],
      metricPoints: [],
    };

    const model = NodeInspectorTelemetryPresenter.create({
      node: {
        id: "agent_main",
        kind: "node",
        type: "AIAgent",
        name: "agent",
        role: "agent",
      },
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [],
      traceView,
    });

    const timeline = model.sections.find((s) => s.id === "agent-timeline");
    expect(timeline?.timeline).toHaveLength(2);
    const keys = timeline?.timeline?.map((entry) => entry.key);
    expect(keys).toContain("span_llm");
    expect(keys).toContain("span_orphan_tool");
  });
});
