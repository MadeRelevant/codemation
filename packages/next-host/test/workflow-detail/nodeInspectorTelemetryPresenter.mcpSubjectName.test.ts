import { describe, expect, it } from "vitest";
import type { ConnectionInvocationRecord, TelemetryRunTraceViewDto } from "@codemation/canvas";
import { NodeInspectorTelemetryPresenter } from "@codemation/canvas";

const traceView: TelemetryRunTraceViewDto = {
  traceId: "trace",
  runId: "run-1",
  spans: [],
  artifacts: [],
  metricPoints: [],
};

function makeInvocation(overrides: Partial<ConnectionInvocationRecord>): ConnectionInvocationRecord {
  return {
    invocationId: "inv-1",
    runId: "run-1",
    workflowId: "wf-1",
    connectionNodeId: "mcp:gmail",
    parentAgentNodeId: "agent-1",
    parentAgentActivationId: "act-1",
    status: "completed",
    updatedAt: "2026-05-23T18:00:00.000Z",
    ...overrides,
  };
}

describe("NodeInspectorTelemetryPresenter — subjectName on tool-call timeline entries", () => {
  it("appends the subjectName to the title when set (MCP tool calls)", () => {
    const model = NodeInspectorTelemetryPresenter.create({
      node: { id: "mcp:gmail", kind: "node", type: "McpConnectionNode", name: "Gmail MCP", role: "tool" },
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [
        makeInvocation({ invocationId: "inv-search", subjectName: "search_messages" }),
        makeInvocation({ invocationId: "inv-send", subjectName: "send_email" }),
      ],
      traceView,
    });

    const timeline = model.sections.find((s) => s.id === "tool-timeline")?.timeline ?? [];
    const titles = flatten(timeline).map((entry) => entry.title);
    expect(titles).toContain("Tool call · search_messages");
    expect(titles).toContain("Tool call · send_email");
  });

  it("falls back to the bare 'Tool call' title when subjectName is absent (back-compat)", () => {
    const model = NodeInspectorTelemetryPresenter.create({
      node: { id: "tool-node", kind: "node", type: "ToolNode", name: "Inline tool", role: "tool" },
      nodeSnapshotsByNodeId: {},
      connectionInvocations: [makeInvocation({ invocationId: "inv-plain", connectionNodeId: "tool-node" })],
      traceView,
    });

    const timeline = model.sections.find((s) => s.id === "tool-timeline")?.timeline ?? [];
    const titles = flatten(timeline).map((entry) => entry.title);
    expect(titles).toContain("Tool call");
    expect(titles.every((t) => !t.includes("·"))).toBe(true);
  });
});

function flatten(
  entries: ReadonlyArray<{ title: string; children?: ReadonlyArray<{ title: string; children?: unknown }> }>,
): ReadonlyArray<{ title: string }> {
  return entries.flatMap((entry) => [entry, ...flatten((entry.children as never) ?? [])]);
}
