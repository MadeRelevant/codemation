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

    expect(model.sections.some((section) => section.id === "agent-metrics")).toBe(false);
    expect(model.sections.some((section) => section.id === "agent-timeline")).toBe(true);
    const overview = model.sections.find((section) => section.id === "overview");
    expect(overview?.pills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Status", value: "completed" }),
        expect.objectContaining({ label: "Duration", value: "3.0 s" }),
      ]),
    );
    expect(overview?.keyValues).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Input tokens", value: "21" })]),
    );
    const timelineSection = model.sections.find((section) => section.id === "agent-timeline");
    expect(timelineSection?.pills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Turns", value: "2" }),
        expect.objectContaining({ label: "Tool calls", value: "0" }),
        expect.objectContaining({ label: "Models", value: "demo-gpt" }),
      ]),
    );
    expect(
      timelineSection?.timeline?.some((entry) => entry.title.includes("Model call") && entry.kind === "agent"),
    ).toBe(true);
    expect(timelineSection?.timeline?.some((entry) => entry.title.includes("Tool call") && entry.kind === "tool")).toBe(
      true,
    );
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

  it("builds language model metrics and response timeline sections from connection telemetry", () => {
    const model = NodeInspectorTelemetryPresenter.create({
      node: {
        id: "chat_model",
        kind: "node",
        type: "OpenAiChatModel",
        name: "Chat model",
        role: "languageModel",
        retryPolicySummary: "3 retries",
        hasNodeErrorHandler: true,
        parentNodeId: "agent_main",
      },
      nodeSnapshotsByNodeId: {
        chat_model: {
          runId: "run_1",
          workflowId: "wf.telemetry",
          nodeId: "chat_model",
          status: "completed",
          queuedAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:01.250Z",
          outputs: { main: [{ json: { ok: true } }] },
        } satisfies NodeExecutionSnapshot,
      },
      connectionInvocations: [
        {
          invocationId: "inv_model_1",
          runId: "run_1",
          workflowId: "wf.telemetry",
          connectionNodeId: "chat_model",
          parentAgentNodeId: "agent_main",
          parentAgentActivationId: "act_1",
          status: "completed",
          updatedAt: "2026-01-01T00:00:01.250Z",
        } satisfies ConnectionInvocationRecord,
      ],
      traceView: {
        traceId: "trace_1",
        runId: "run_1",
        spans: [
          {
            traceId: "trace_1",
            spanId: "span_model_1",
            runId: "run_1",
            workflowId: "wf.telemetry",
            connectionInvocationId: "inv_model_1",
            name: "gen_ai.chat.completion",
            kind: "client",
            status: "completed",
            startTime: "2026-01-01T00:00:00.250Z",
            endTime: "2026-01-01T00:00:01.250Z",
            modelName: "gpt-4o-mini",
          },
        ],
        artifacts: [
          {
            artifactId: "artifact_model_response",
            traceId: "trace_1",
            spanId: "span_model_1",
            runId: "run_1",
            workflowId: "wf.telemetry",
            kind: "ai.response",
            contentType: "application/json",
            previewJson: { reply: "Ready." },
            createdAt: "2026-01-01T00:00:01.250Z",
          },
        ],
        metricPoints: [
          {
            metricPointId: "metric_input",
            traceId: "trace_1",
            spanId: "span_model_1",
            runId: "run_1",
            workflowId: "wf.telemetry",
            metricName: "gen_ai.usage.input_tokens",
            value: 8,
            observedAt: "2026-01-01T00:00:01.250Z",
          },
          {
            metricPointId: "metric_output",
            traceId: "trace_1",
            spanId: "span_model_1",
            runId: "run_1",
            workflowId: "wf.telemetry",
            metricName: "gen_ai.usage.output_tokens",
            value: 13,
            observedAt: "2026-01-01T00:00:01.250Z",
          },
          {
            metricPointId: "metric_total",
            traceId: "trace_1",
            spanId: "span_model_1",
            runId: "run_1",
            workflowId: "wf.telemetry",
            metricName: "gen_ai.usage.total_tokens",
            value: 21,
            observedAt: "2026-01-01T00:00:01.250Z",
          },
        ],
      } satisfies TelemetryRunTraceViewDto,
    });

    const overview = model.sections.find((section) => section.id === "overview");
    expect(overview?.pills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Role", value: "languageModel" }),
        expect.objectContaining({ label: "Status", value: "completed" }),
      ]),
    );
    expect(overview?.keyValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Retry", value: "3 retries" }),
        expect.objectContaining({ label: "Node error handler", value: "Configured" }),
        expect.objectContaining({ label: "Parent node", value: "agent_main" }),
        expect.objectContaining({ label: "Input tokens", value: "8" }),
        expect.objectContaining({ label: "Output tokens", value: "13" }),
        expect.objectContaining({ label: "Total tokens", value: "21" }),
      ]),
    );

    const metrics = model.sections.find((section) => section.id === "language-model-metrics");
    expect(metrics?.pills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Invocations", value: "1" }),
        expect.objectContaining({ label: "Model", value: "gpt-4o-mini" }),
      ]),
    );

    const timeline = model.sections.find((section) => section.id === "language-model-timeline");
    expect(timeline?.timeline).toHaveLength(1);
    expect(timeline?.timeline?.[0]).toEqual(
      expect.objectContaining({
        kind: "agent",
        title: "Model call · gpt-4o-mini",
        jsonBlocks: [expect.objectContaining({ label: "ai.response", value: { reply: "Ready." } })],
      }),
    );
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
    expect(timeline?.timeline?.[0]?.kind).toBe("tool");
    expect(timeline?.timeline?.[0]?.subtitle).toContain("Invocation inv_tool_1");
  });

  it("builds tool sections with fallback labels and keeps empty Gmail sections visible", () => {
    const toolModel = NodeInspectorTelemetryPresenter.create({
      node: {
        id: "tool_lookup",
        kind: "node",
        type: "ToolNode",
        name: "Lookup",
        role: "tool",
      },
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [
        {
          invocationId: "tool_invocation_1",
          runId: "run_1",
          workflowId: "wf.telemetry",
          connectionNodeId: "tool_lookup",
          parentAgentNodeId: "agent_main",
          parentAgentActivationId: "act_1",
          status: "completed",
          updatedAt: "2026-01-01T00:00:02.000Z",
        } satisfies ConnectionInvocationRecord,
        {
          invocationId: "tool_invocation_2",
          runId: "run_1",
          workflowId: "wf.telemetry",
          connectionNodeId: "tool_lookup",
          parentAgentNodeId: "agent_main",
          parentAgentActivationId: "act_1",
          status: "failed",
          error: {
            message: "Invalid input for tool",
            name: "ZodError",
            details: {
              repair: {
                attempt: 1,
                maxAttempts: 2,
              },
            },
          },
          updatedAt: "2026-01-01T00:00:03.000Z",
        } satisfies ConnectionInvocationRecord,
      ],
      traceView: {
        traceId: "trace_1",
        runId: "run_1",
        spans: [
          {
            traceId: "trace_1",
            spanId: "span_tool_1",
            runId: "run_1",
            workflowId: "wf.telemetry",
            connectionInvocationId: "tool_invocation_1",
            name: "agent.tool.call",
            kind: "client",
            status: "completed",
            endTime: "2026-01-01T00:00:02.000Z",
          },
        ],
        artifacts: [
          {
            artifactId: "artifact_tool_input",
            traceId: "trace_1",
            spanId: "span_tool_1",
            runId: "run_1",
            workflowId: "wf.telemetry",
            kind: "tool.input",
            contentType: "application/json",
            previewJson: { query: "rfq-123" },
            createdAt: "2026-01-01T00:00:02.000Z",
          },
        ],
        metricPoints: [],
      } satisfies TelemetryRunTraceViewDto,
    });

    const toolMetrics = toolModel.sections.find((section) => section.id === "tool-metrics");
    expect(toolMetrics?.pills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Invocations", value: "2" }),
        expect.objectContaining({ label: "Completed", value: "1" }),
        expect.objectContaining({ label: "Failed", value: "1" }),
        expect.objectContaining({ label: "Repair loops", value: "1" }),
      ]),
    );

    const toolTimeline = toolModel.sections.find((section) => section.id === "tool-timeline");
    expect(toolTimeline?.timeline).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "tool",
          title: "Tool call",
          pills: [expect.objectContaining({ label: "Status", value: "completed" })],
        }),
        expect.objectContaining({
          kind: "tool",
          title: "Tool call",
          jsonBlocks: [expect.objectContaining({ label: "tool.error" })],
        }),
      ]),
    );

    const gmailModel = NodeInspectorTelemetryPresenter.create({
      node: {
        id: "gmail_trigger",
        kind: "trigger",
        type: "OnNewGmailTrigger",
        name: "Gmail",
        icon: "si:gmail",
      },
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [],
      traceView: {
        traceId: "trace_2",
        runId: "run_2",
        spans: [],
        artifacts: [],
        metricPoints: [],
      } satisfies TelemetryRunTraceViewDto,
    });

    expect(gmailModel.sections.find((section) => section.id === "gmail-messages")?.emptyLabel).toBe(
      "No Gmail message preview captured for this run yet.",
    );
    expect(gmailModel.sections.find((section) => section.id === "gmail-metrics")?.pills).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Messages emitted", value: "0" }),
        expect.objectContaining({ label: "Attachments", value: "0" }),
        expect.objectContaining({ label: "Attachment bytes", value: "0" }),
      ]),
    );
  });
});
