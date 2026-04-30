// @vitest-environment jsdom

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type {
  ConnectionInvocationRecord,
  TelemetryRunTraceViewDto,
} from "../../src/features/workflows/hooks/realtime/realtime";
import { NodePropertiesConfigSection } from "../../src/features/workflows/components/workflowDetail/NodePropertiesConfigSection";
import type { WorkflowDiagramNode } from "../../src/features/workflows/lib/workflowDetail/workflowDetailTypes";

const BASE_RUN_ID = "run_ui_test";
const BASE_WORKFLOW_ID = "wf.ui_test";
const LLM_NODE_ID = "AIAgentNode$1:1__conn__llm";

const llmNode: WorkflowDiagramNode = {
  id: LLM_NODE_ID,
  kind: "node",
  type: "OpenAiChatModel",
  name: "Chat model",
  role: "languageModel",
};

function makeInvocation(invId: string, activationId: string, startedAt: string): ConnectionInvocationRecord {
  return {
    invocationId: invId,
    runId: BASE_RUN_ID,
    workflowId: BASE_WORKFLOW_ID,
    connectionNodeId: LLM_NODE_ID,
    parentAgentNodeId: "agent_main",
    parentAgentActivationId: activationId,
    status: "completed",
    startedAt,
    updatedAt: startedAt,
  };
}

function makeSpan(invId: string, spanId: string, startTime: string): TelemetryRunTraceViewDto["spans"][number] {
  return {
    traceId: "trace_ui_test",
    spanId,
    runId: BASE_RUN_ID,
    workflowId: BASE_WORKFLOW_ID,
    connectionInvocationId: invId,
    name: "gen_ai.chat.completion",
    kind: "client",
    status: "completed",
    startTime,
    endTime: startTime,
    modelName: "gpt-4o",
  };
}

const invA1 = makeInvocation("inv_a1", "act_a", "2026-01-01T00:00:00.000Z");
const invA2 = makeInvocation("inv_a2", "act_a", "2026-01-01T00:00:02.000Z");
const invB1 = makeInvocation("inv_b1", "act_b", "2026-01-01T00:00:10.000Z");
const invB2 = makeInvocation("inv_b2", "act_b", "2026-01-01T00:00:11.000Z");

const traceView: TelemetryRunTraceViewDto = {
  traceId: "trace_ui_test",
  runId: BASE_RUN_ID,
  spans: [
    makeSpan("inv_a1", "span_a1", "2026-01-01T00:00:00.000Z"),
    makeSpan("inv_a2", "span_a2", "2026-01-01T00:00:02.000Z"),
    makeSpan("inv_b1", "span_b1", "2026-01-01T00:00:10.000Z"),
    makeSpan("inv_b2", "span_b2", "2026-01-01T00:00:11.000Z"),
  ],
  artifacts: [],
  metricPoints: [],
};

const connectionInvocations: ReadonlyArray<ConnectionInvocationRecord> = [invA1, invA2, invB1, invB2];

describe("NodePropertiesConfigSection — focused item UI", () => {
  it("renders the per-item breadcrumb and the full Item subtree (all rounds for that item)", () => {
    render(
      <NodePropertiesConfigSection
        node={llmNode}
        telemetryRunId={BASE_RUN_ID}
        nodeSnapshotsByNodeId={{}}
        connectionInvocations={connectionInvocations}
        telemetryRunTrace={traceView}
        telemetryIsLoading={false}
        telemetryLoadError={null}
        focusedInvocationId="inv_a2"
        onSelectInvocation={vi.fn()}
      />,
    );

    expect(screen.getByTestId("node-properties-section-breadcrumb-language-model-timeline")).toBeInTheDocument();
    // Single Item entry parent (the item subtree), with both rounds rendered as children.
    const itemEntries = screen.getAllByTestId(/^node-properties-timeline-entry-legacy::act_a::/);
    expect(itemEntries).toHaveLength(1);
    const childEntries = screen.getAllByTestId(/^node-properties-timeline-entry-span_a/);
    expect(childEntries).toHaveLength(2);
  });

  it("prev button calls onSelectInvocation with the FIRST invocation of the previous item", () => {
    const onSelectInvocation = vi.fn();
    render(
      <NodePropertiesConfigSection
        node={llmNode}
        telemetryRunId={BASE_RUN_ID}
        nodeSnapshotsByNodeId={{}}
        connectionInvocations={connectionInvocations}
        telemetryRunTrace={traceView}
        telemetryIsLoading={false}
        telemetryLoadError={null}
        focusedInvocationId="inv_b2"
        onSelectInvocation={onSelectInvocation}
      />,
    );

    const prevBtn = screen.getByTestId("node-properties-section-prev-language-model-timeline");
    expect(prevBtn).not.toBeDisabled();
    fireEvent.click(prevBtn);
    expect(onSelectInvocation).toHaveBeenCalledWith("inv_a1");
  });

  it("next button calls onSelectInvocation with the FIRST invocation of the next item", () => {
    const onSelectInvocation = vi.fn();
    render(
      <NodePropertiesConfigSection
        node={llmNode}
        telemetryRunId={BASE_RUN_ID}
        nodeSnapshotsByNodeId={{}}
        connectionInvocations={connectionInvocations}
        telemetryRunTrace={traceView}
        telemetryIsLoading={false}
        telemetryLoadError={null}
        focusedInvocationId="inv_a2"
        onSelectInvocation={onSelectInvocation}
      />,
    );

    const nextBtn = screen.getByTestId("node-properties-section-next-language-model-timeline");
    expect(nextBtn).not.toBeDisabled();
    fireEvent.click(nextBtn);
    expect(onSelectInvocation).toHaveBeenCalledWith("inv_b1");
  });

  it("prev button is disabled when focused invocation lives in the FIRST item", () => {
    render(
      <NodePropertiesConfigSection
        node={llmNode}
        telemetryRunId={BASE_RUN_ID}
        nodeSnapshotsByNodeId={{}}
        connectionInvocations={connectionInvocations}
        telemetryRunTrace={traceView}
        telemetryIsLoading={false}
        telemetryLoadError={null}
        focusedInvocationId="inv_a2"
        onSelectInvocation={vi.fn()}
      />,
    );

    const prevBtn = screen.getByTestId("node-properties-section-prev-language-model-timeline");
    expect(prevBtn).toBeDisabled();
  });

  it("next button is disabled when focused invocation lives in the LAST item", () => {
    render(
      <NodePropertiesConfigSection
        node={llmNode}
        telemetryRunId={BASE_RUN_ID}
        nodeSnapshotsByNodeId={{}}
        connectionInvocations={connectionInvocations}
        telemetryRunTrace={traceView}
        telemetryIsLoading={false}
        telemetryLoadError={null}
        focusedInvocationId="inv_b1"
        onSelectInvocation={vi.fn()}
      />,
    );

    const nextBtn = screen.getByTestId("node-properties-section-next-language-model-timeline");
    expect(nextBtn).toBeDisabled();
  });

  it("hides BOTH navigation chevrons when there is only one item", () => {
    const singleItemInvocations: ReadonlyArray<ConnectionInvocationRecord> = [invA1, invA2];
    render(
      <NodePropertiesConfigSection
        node={llmNode}
        telemetryRunId={BASE_RUN_ID}
        nodeSnapshotsByNodeId={{}}
        connectionInvocations={singleItemInvocations}
        telemetryRunTrace={traceView}
        telemetryIsLoading={false}
        telemetryLoadError={null}
        focusedInvocationId="inv_a2"
        onSelectInvocation={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("node-properties-section-prev-language-model-timeline")).toBeNull();
    expect(screen.queryByTestId("node-properties-section-next-language-model-timeline")).toBeNull();
    // Breadcrumb still renders so the user knows they're in focus mode.
    expect(screen.getByTestId("node-properties-section-breadcrumb-language-model-timeline")).toBeInTheDocument();
  });

  it("no breadcrumb and grouped accordion entries when focusedInvocationId is null", () => {
    render(
      <NodePropertiesConfigSection
        node={llmNode}
        telemetryRunId={BASE_RUN_ID}
        nodeSnapshotsByNodeId={{}}
        connectionInvocations={connectionInvocations}
        telemetryRunTrace={traceView}
        telemetryIsLoading={false}
        telemetryLoadError={null}
        focusedInvocationId={null}
        onSelectInvocation={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("node-properties-section-breadcrumb-language-model-timeline")).toBeNull();
    const parentEntries = screen.getAllByTestId(/^node-properties-timeline-entry-legacy::act_/);
    expect(parentEntries).toHaveLength(2);
  });
});
