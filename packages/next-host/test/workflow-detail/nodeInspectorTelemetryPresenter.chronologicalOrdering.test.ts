import { describe, expect, it } from "vitest";
import type { TelemetryRunTraceViewDto } from "../../src/features/workflows/hooks/realtime/realtime";
import { NodeInspectorTelemetryPresenter } from "../../src/features/workflows/lib/workflowDetail/NodeInspectorTelemetryPresenter";

const TRACE_ID = "trace_chrono";
const RUN_ID = "run_chrono";
const WORKFLOW_ID = "wf.chrono";
const AGENT_NODE_ID = "agent_main";

/**
 * Regression: when the engine doesn't link tool spans to a parent LLM via `parentSpanId` (e.g.
 * legacy traces, framework boundary), the agent timeline previously rendered LLM rounds first
 * and orphan tool calls afterwards. That broke the natural reading order of "request → tool
 * calls → response" — orphan tools always appeared at the bottom even when they happened
 * BETWEEN the two LLM rounds.
 */
describe("NodeInspectorTelemetryPresenter – agent timeline chronological ordering", () => {
  it("interleaves orphan tool calls between LLM rounds based on startTime", () => {
    const traceView: TelemetryRunTraceViewDto = {
      traceId: TRACE_ID,
      runId: RUN_ID,
      spans: [
        // First LLM round at 00:00 (no parentSpanId on the tools to link them)
        {
          traceId: TRACE_ID,
          spanId: "span_llm_1",
          runId: RUN_ID,
          workflowId: WORKFLOW_ID,
          nodeId: AGENT_NODE_ID,
          name: "gen_ai.chat.completion",
          kind: "client",
          status: "completed",
          startTime: "2026-01-01T00:00:00.000Z",
          endTime: "2026-01-01T00:00:01.000Z",
          modelName: "gpt-4o",
        },
        // Tool call happens at 00:02 (orphan, no parentSpanId)
        {
          traceId: TRACE_ID,
          spanId: "span_tool_a",
          runId: RUN_ID,
          workflowId: WORKFLOW_ID,
          nodeId: AGENT_NODE_ID,
          name: "agent.tool.call",
          kind: "client",
          status: "completed",
          startTime: "2026-01-01T00:00:02.000Z",
          endTime: "2026-01-01T00:00:03.000Z",
          attributes: { "codemation.tool.name": "searchInMail" },
        },
        // Second LLM round at 00:04 — must come AFTER the tool call in display
        {
          traceId: TRACE_ID,
          spanId: "span_llm_2",
          runId: RUN_ID,
          workflowId: WORKFLOW_ID,
          nodeId: AGENT_NODE_ID,
          name: "gen_ai.chat.completion",
          kind: "client",
          status: "completed",
          startTime: "2026-01-01T00:00:04.000Z",
          endTime: "2026-01-01T00:00:05.000Z",
          modelName: "gpt-4o",
        },
      ],
      artifacts: [],
      metricPoints: [],
    };

    const model = NodeInspectorTelemetryPresenter.create({
      node: { id: AGENT_NODE_ID, kind: "node", type: "AIAgent", name: "Mail orchestrator", role: "agent" },
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [],
      traceView,
    });

    const section = model.sections.find((s) => s.id === "agent-timeline");
    expect(section?.timeline).toBeDefined();
    const titles = (section?.timeline ?? []).map((entry) =>
      typeof entry.title === "string" ? entry.title : String(entry.title ?? ""),
    );
    // LLM 1 → tool call → LLM 2 (chronological), not LLM 1 → LLM 2 → tool call
    expect(titles[0]).toContain("Model call");
    expect(titles[1]).toContain("Tool call");
    expect(titles[2]).toContain("Model call");
  });
});
