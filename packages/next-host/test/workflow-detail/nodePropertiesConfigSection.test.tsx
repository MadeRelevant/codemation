// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ConnectionInvocationRecord,
  NodeExecutionSnapshot,
  TelemetryRunTraceViewDto,
} from "../../src/features/workflows/hooks/realtime/realtime";
import { NodePropertiesConfigSection } from "../../src/features/workflows/components/workflowDetail/NodePropertiesConfigSection";
import { NodeInspectorTelemetryPresenter } from "../../src/features/workflows/lib/workflowDetail/NodeInspectorTelemetryPresenter";

describe("NodePropertiesConfigSection", () => {
  const originalCreate = NodeInspectorTelemetryPresenter.create;

  afterEach(() => {
    NodeInspectorTelemetryPresenter.create = originalCreate;
  });

  it("renders loading, error, and missing-run telemetry states", () => {
    const node = {
      id: "agent_main",
      kind: "node",
      type: "AIAgent",
      name: "Agent",
      role: "agent",
    };
    const { rerender } = render(
      <NodePropertiesConfigSection
        node={node}
        telemetryRunId="run_1"
        nodeSnapshotsByNodeId={{}}
        connectionInvocations={[]}
        telemetryRunTrace={undefined}
        telemetryIsLoading
        telemetryLoadError={null}
      />,
    );

    expect(screen.getByTestId("node-properties-telemetry-loading")).toBeInTheDocument();

    rerender(
      <NodePropertiesConfigSection
        node={node}
        telemetryRunId="run_1"
        nodeSnapshotsByNodeId={{}}
        connectionInvocations={[]}
        telemetryRunTrace={undefined}
        telemetryIsLoading={false}
        telemetryLoadError="Trace query failed"
      />,
    );

    expect(screen.getByTestId("node-properties-telemetry-error")).toHaveTextContent("Trace query failed");

    rerender(
      <NodePropertiesConfigSection
        node={node}
        telemetryRunId={null}
        nodeSnapshotsByNodeId={{}}
        connectionInvocations={[]}
        telemetryRunTrace={undefined}
        telemetryIsLoading={false}
        telemetryLoadError={null}
      />,
    );

    expect(screen.getByTestId("node-properties-telemetry-hint")).toBeInTheDocument();
  });

  it("renders telemetry-backed overview and timeline sections with status and tokens up top", () => {
    render(
      <NodePropertiesConfigSection
        node={{
          id: "agent_main",
          kind: "node",
          type: "AIAgent",
          name: "Agent",
          role: "agent",
          retryPolicySummary: "2 retries",
          hasNodeErrorHandler: true,
        }}
        telemetryRunId="run_1"
        nodeSnapshotsByNodeId={{
          agent_main: {
            runId: "run_1",
            workflowId: "wf.telemetry",
            nodeId: "agent_main",
            status: "completed",
            startedAt: "2026-01-01T00:00:00.000Z",
            finishedAt: "2026-01-01T00:00:02.000Z",
            updatedAt: "2026-01-01T00:00:02.000Z",
            inputsByPort: { main: [{ json: { prompt: "hello" } }] },
            outputs: { main: [{ json: { answer: "world" } }] },
          } satisfies NodeExecutionSnapshot,
        }}
        connectionInvocations={[
          {
            invocationId: "tool_invocation_1",
            runId: "run_1",
            workflowId: "wf.telemetry",
            connectionNodeId: "tool_lookup",
            parentAgentNodeId: "agent_main",
            parentAgentActivationId: "act_1",
            status: "completed",
            updatedAt: "2026-01-01T00:00:01.750Z",
          } satisfies ConnectionInvocationRecord,
        ]}
        telemetryRunTrace={
          {
            traceId: "trace_1",
            runId: "run_1",
            spans: [
              {
                traceId: "trace_1",
                spanId: "span_model_1",
                runId: "run_1",
                workflowId: "wf.telemetry",
                nodeId: "agent_main",
                name: "gen_ai.chat.completion",
                kind: "client",
                status: "completed",
                startTime: "2026-01-01T00:00:00.000Z",
                endTime: "2026-01-01T00:00:01.000Z",
                modelName: "gpt-4o-mini",
              },
              {
                traceId: "trace_1",
                spanId: "span_tool_1",
                runId: "run_1",
                workflowId: "wf.telemetry",
                nodeId: "agent_main",
                name: "agent.tool.call",
                kind: "client",
                status: "completed",
                startTime: "2026-01-01T00:00:01.100Z",
                endTime: "2026-01-01T00:00:01.750Z",
                attributes: {
                  "codemation.tool.name": "rfq_lookup",
                },
              },
            ],
            artifacts: [
              {
                artifactId: "artifact_messages",
                traceId: "trace_1",
                spanId: "span_model_1",
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
                spanId: "span_model_1",
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
                observedAt: "2026-01-01T00:00:02.000Z",
              },
              {
                metricPointId: "metric_input",
                traceId: "trace_1",
                spanId: "span_model_1",
                runId: "run_1",
                workflowId: "wf.telemetry",
                nodeId: "agent_main",
                metricName: "gen_ai.usage.input_tokens",
                value: 21,
                observedAt: "2026-01-01T00:00:01.000Z",
              },
              {
                metricPointId: "metric_output",
                traceId: "trace_1",
                spanId: "span_model_1",
                runId: "run_1",
                workflowId: "wf.telemetry",
                nodeId: "agent_main",
                metricName: "gen_ai.usage.output_tokens",
                value: 13,
                observedAt: "2026-01-01T00:00:01.000Z",
              },
            ],
          } satisfies TelemetryRunTraceViewDto
        }
        telemetryIsLoading={false}
        telemetryLoadError={null}
      />,
    );

    expect(screen.getByTestId("node-properties-section-overview")).toHaveTextContent("Overview");
    expect(screen.getByTestId("node-properties-section-overview")).toHaveTextContent("completed");
    expect(screen.getByTestId("node-properties-section-overview")).toHaveTextContent("2.0 s");
    expect(screen.getByTestId("node-properties-section-overview")).toHaveTextContent("2 retries");
    expect(screen.getByTestId("node-properties-section-overview")).toHaveTextContent("Input tokens");
    expect(screen.getByTestId("node-properties-section-overview")).toHaveTextContent("21");
    expect(screen.getByTestId("node-properties-section-overview")).toHaveTextContent("Output tokens");
    expect(screen.getByTestId("node-properties-section-overview")).toHaveTextContent("13");
    expect(screen.queryByTestId("node-properties-section-execution")).not.toBeInTheDocument();
    expect(screen.getByTestId("node-properties-section-agent-timeline")).toHaveTextContent("Model call");
    expect(screen.getByTestId("node-properties-section-agent-timeline")).toHaveTextContent("Tool call");
    expect(screen.getByTestId("node-properties-section-agent-timeline")).toHaveTextContent("Turns");
    expect(screen.getByTestId("node-properties-section-agent-timeline")).toHaveTextContent("Tool calls");
    expect(screen.getByTestId("node-properties-section-agent-timeline")).toHaveTextContent("Models");
    expect(screen.getByTestId("node-properties-section-agent-timeline")).toHaveTextContent("Review the message.");
    expect(screen.getByTestId("node-properties-section-agent-timeline")).toHaveTextContent("classification");
    expect(screen.getByTestId("node-properties-timeline-entry-icon-span_model_1-agent")).toBeInTheDocument();
    expect(screen.getByTestId("node-properties-timeline-entry-icon-span_tool_1-tool")).toBeInTheDocument();
    expect(screen.getByTestId("node-properties-timeline-entry-pills-span_model_1")).toHaveClass("justify-end");
  });

  it("renders empty-state Gmail message sections when no preview artifact exists", () => {
    render(
      <NodePropertiesConfigSection
        node={{
          id: "gmail_trigger",
          kind: "trigger",
          type: "OnNewGmailTrigger",
          name: "On Gmail",
          icon: "si:gmail",
        }}
        telemetryRunId="run_2"
        nodeSnapshotsByNodeId={{}}
        connectionInvocations={[]}
        telemetryRunTrace={
          {
            traceId: "trace_2",
            runId: "run_2",
            spans: [],
            artifacts: [],
            metricPoints: [],
          } satisfies TelemetryRunTraceViewDto
        }
        telemetryIsLoading={false}
        telemetryLoadError={null}
      />,
    );

    expect(screen.getByTestId("node-properties-section-gmail-messages")).toHaveTextContent(
      "No Gmail message preview captured for this run yet.",
    );
    expect(screen.getByTestId("node-properties-section-gmail-metrics")).toHaveTextContent("Messages emitted");
  });

  it("renders presenter-provided tables and top-level json blocks", () => {
    NodeInspectorTelemetryPresenter.create = () => ({
      sections: [
        {
          id: "custom",
          title: "Custom section",
          table: {
            columns: ["messageId", "subject"],
            rows: [{ messageId: "message_1", subject: "Quote request" }],
          },
          jsonBlocks: [{ label: "payload", value: { ok: true } }],
        },
      ],
    });

    render(
      <NodePropertiesConfigSection
        node={{
          id: "agent_main",
          kind: "node",
          type: "AIAgent",
          name: "Agent",
          role: "agent",
        }}
        telemetryRunId="run_1"
        nodeSnapshotsByNodeId={{}}
        connectionInvocations={[]}
        telemetryRunTrace={undefined}
        telemetryIsLoading={false}
        telemetryLoadError={null}
      />,
    );

    expect(screen.getByTestId("node-properties-section-custom")).toHaveTextContent("message_1");
    expect(screen.getByTestId("node-properties-section-custom")).toHaveTextContent("Quote request");
    expect(screen.getByTestId("node-properties-section-custom")).toHaveTextContent('"ok": true');
  });

  it("omits the telemetry foundation helper copy", () => {
    render(
      <NodePropertiesConfigSection
        node={{
          id: "agent_main",
          kind: "node",
          type: "AIAgent",
          name: "Agent",
          role: "agent",
        }}
        telemetryRunId="run_1"
        nodeSnapshotsByNodeId={{}}
        connectionInvocations={[]}
        telemetryRunTrace={undefined}
        telemetryIsLoading={false}
        telemetryLoadError={null}
      />,
    );

    expect(screen.queryByText(/rich node details are powered/i)).not.toBeInTheDocument();
  });
});
