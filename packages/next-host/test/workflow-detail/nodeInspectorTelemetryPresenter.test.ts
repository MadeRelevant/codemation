import { describe, expect, it } from "vitest";
import type {
  ConnectionInvocationRecord,
  NodeExecutionSnapshot,
} from "../../src/features/workflows/hooks/realtime/realtime";
import type { TelemetryRunTraceViewDto } from "../../src/features/workflows/hooks/realtime/realtime";
import { NodeInspectorTelemetryPresenter } from "../../src/features/workflows/lib/workflowDetail/NodeInspectorTelemetryPresenter";

describe("NodeInspectorTelemetryPresenter", () => {
  it("builds AI agent metrics and timeline sections from trace telemetry", () => {
    const model = NodeInspectorTelemetryPresenter.create({
      node: {
        id: "agent_main",
        kind: "node",
        type: "AIAgent",
        name: "RFQ agent",
        role: "agent",
      },
      nodeSnapshotsByNodeId: {
        agent_main: {
          runId: "run_1",
          workflowId: "wf.telemetry",
          nodeId: "agent_main",
          status: "completed",
          startedAt: "2026-01-01T00:00:00.000Z",
          finishedAt: "2026-01-01T00:00:03.000Z",
          updatedAt: "2026-01-01T00:00:03.000Z",
        } satisfies NodeExecutionSnapshot,
      },
      connectionInvocations: [
        {
          invocationId: "inv_tool_1",
          runId: "run_1",
          workflowId: "wf.telemetry",
          connectionNodeId: "tool_lookup",
          parentAgentNodeId: "agent_main",
          parentAgentActivationId: "act_1",
          status: "completed",
          updatedAt: "2026-01-01T00:00:02.000Z",
        } satisfies ConnectionInvocationRecord,
      ],
      traceView: {
        traceId: "trace_1",
        runId: "run_1",
        spans: [
          {
            traceId: "trace_1",
            spanId: "span_model",
            runId: "run_1",
            workflowId: "wf.telemetry",
            nodeId: "agent_main",
            name: "gen_ai.chat.completion",
            kind: "client",
            status: "completed",
            startTime: "2026-01-01T00:00:00.000Z",
            endTime: "2026-01-01T00:00:01.000Z",
            modelName: "demo-gpt",
          },
          {
            traceId: "trace_1",
            spanId: "span_tool",
            runId: "run_1",
            workflowId: "wf.telemetry",
            nodeId: "agent_main",
            name: "agent.tool.call",
            kind: "client",
            status: "completed",
            startTime: "2026-01-01T00:00:01.100Z",
            endTime: "2026-01-01T00:00:02.000Z",
            attributes: {
              "codemation.tool.name": "rfq_lookup",
            },
          },
        ],
        artifacts: [
          {
            artifactId: "artifact_messages",
            traceId: "trace_1",
            spanId: "span_model",
            runId: "run_1",
            workflowId: "wf.telemetry",
            nodeId: "agent_main",
            kind: "ai.messages",
            contentType: "application/json",
            previewJson: [{ role: "user", content: "Review the message." }],
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            artifactId: "artifact_response",
            traceId: "trace_1",
            spanId: "span_model",
            runId: "run_1",
            workflowId: "wf.telemetry",
            nodeId: "agent_main",
            kind: "ai.response",
            contentType: "application/json",
            previewJson: { classification: "rfq" },
            createdAt: "2026-01-01T00:00:01.000Z",
          },
        ],
        metricPoints: [
          {
            metricPointId: "metric_turns",
            traceId: "trace_1",
            spanId: "span_agent",
            runId: "run_1",
            workflowId: "wf.telemetry",
            nodeId: "agent_main",
            metricName: "codemation.ai.turns",
            value: 2,
            observedAt: "2026-01-01T00:00:03.000Z",
          },
          {
            metricPointId: "metric_input",
            traceId: "trace_1",
            spanId: "span_model",
            runId: "run_1",
            workflowId: "wf.telemetry",
            nodeId: "agent_main",
            metricName: "gen_ai.usage.input_tokens",
            value: 21,
            observedAt: "2026-01-01T00:00:01.000Z",
          },
        ],
      } satisfies TelemetryRunTraceViewDto,
    });

    expect(model.sections.some((section) => section.id === "agent-metrics")).toBe(true);
    expect(model.sections.some((section) => section.id === "agent-timeline")).toBe(true);
    const metrics = model.sections.find((section) => section.id === "agent-metrics");
    expect(metrics?.pills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Turns", value: "2" }),
        expect.objectContaining({ label: "Input tokens", value: "21" }),
      ]),
    );
    const timeline = model.sections.find((section) => section.id === "agent-timeline");
    expect(timeline?.timeline?.some((entry) => entry.title.includes("Model call"))).toBe(true);
    expect(timeline?.timeline?.some((entry) => entry.title.includes("Tool call"))).toBe(true);
  });

  it("builds Gmail metrics and latest-message sections from trace telemetry", () => {
    const model = NodeInspectorTelemetryPresenter.create({
      node: {
        id: "gmail_trigger",
        kind: "trigger",
        type: "OnNewGmailTrigger",
        name: "On Gmail",
        icon: "si:gmail",
      },
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [],
      traceView: {
        traceId: "trace_1",
        runId: "run_1",
        spans: [],
        artifacts: [
          {
            artifactId: "artifact_gmail",
            traceId: "trace_1",
            spanId: "span_trigger",
            runId: "run_1",
            workflowId: "wf.gmail",
            nodeId: "gmail_trigger",
            kind: "gmail.messages",
            contentType: "application/json",
            previewJson: [
              {
                messageId: "message_1",
                subject: "Quote request",
                from: "buyer@example.com",
                attachmentCount: 1,
                attachmentBytes: 42,
              },
            ],
            createdAt: "2026-01-01T00:00:01.000Z",
          },
        ],
        metricPoints: [
          {
            metricPointId: "metric_messages",
            runId: "run_1",
            workflowId: "wf.gmail",
            nodeId: "gmail_trigger",
            metricName: "codemation.gmail.messages_emitted",
            value: 1,
            observedAt: "2026-01-01T00:00:01.000Z",
          },
        ],
      } satisfies TelemetryRunTraceViewDto,
    });

    expect(model.sections.some((section) => section.id === "gmail-metrics")).toBe(true);
    const messagesSection = model.sections.find((section) => section.id === "gmail-messages");
    expect(messagesSection?.table?.rows).toEqual([
      {
        messageId: "message_1",
        subject: "Quote request",
        from: "buyer@example.com",
        attachmentCount: "1",
        attachmentBytes: "42",
      },
    ]);
  });

  it("falls back to persisted tool invocations when trace spans are absent", () => {
    const model = NodeInspectorTelemetryPresenter.create({
      node: {
        id: "tool_lookup",
        kind: "node",
        type: "ToolConnection",
        name: "Lookup tool",
        role: "tool",
      },
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [
        {
          invocationId: "inv_tool_1",
          runId: "run_1",
          workflowId: "wf.telemetry",
          connectionNodeId: "tool_lookup",
          parentAgentNodeId: "agent_main",
          parentAgentActivationId: "act_1",
          status: "failed",
          managedInput: {},
          error: {
            message: "Invalid input for tool",
            name: "ZodError",
            details: {
              errorType: "validation",
              repair: {
                attempt: 1,
                maxAttempts: 2,
                nextAction: "model_retry_with_tool_error_message",
              },
            },
          },
          queuedAt: "2026-01-01T00:00:00.000Z",
          startedAt: "2026-01-01T00:00:00.000Z",
          finishedAt: "2026-01-01T00:00:01.000Z",
          updatedAt: "2026-01-01T00:00:01.000Z",
        } satisfies ConnectionInvocationRecord,
      ],
      traceView: {
        traceId: "trace_1",
        runId: "run_1",
        spans: [],
        artifacts: [],
        metricPoints: [],
      } satisfies TelemetryRunTraceViewDto,
    });

    const metrics = model.sections.find((section) => section.id === "tool-metrics");
    expect(metrics?.pills).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Repair loops", value: "1" })]),
    );
    const timeline = model.sections.find((section) => section.id === "tool-timeline");
    expect(timeline?.timeline?.[0]?.jsonBlocks).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "tool.error" })]),
    );
  });
});
