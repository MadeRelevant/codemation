import { describe, expect, it } from "vitest";
import type {
  ConnectionInvocationRecord,
  TelemetryRunTraceViewDto,
} from "../../src/features/workflows/hooks/realtime/realtime";
import { NodeInspectorTelemetryPresenter } from "../../src/features/workflows/lib/workflowDetail/NodeInspectorTelemetryPresenter";

const BASE_TRACE_ID = "trace_focus_test";
const BASE_RUN_ID = "run_focus_test";
const BASE_WORKFLOW_ID = "wf.focus_test";
const LLM_NODE_ID = "AIAgentNode$1:1__conn__llm";
const TOOL_NODE_ID = "AIAgentNode$1:1__conn__tool__conn__search";

function makeEmptyTraceView(overrides: Partial<TelemetryRunTraceViewDto> = {}): TelemetryRunTraceViewDto {
  return {
    traceId: BASE_TRACE_ID,
    runId: BASE_RUN_ID,
    spans: [],
    artifacts: [],
    metricPoints: [],
    ...overrides,
  };
}

function makeLlmInvocation(invId: string, activationId: string, startedAt: string): ConnectionInvocationRecord {
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

function makeToolInvocation(invId: string, activationId: string, startedAt: string): ConnectionInvocationRecord {
  return {
    invocationId: invId,
    runId: BASE_RUN_ID,
    workflowId: BASE_WORKFLOW_ID,
    connectionNodeId: TOOL_NODE_ID,
    parentAgentNodeId: "agent_main",
    parentAgentActivationId: activationId,
    status: "completed",
    startedAt,
    updatedAt: startedAt,
  };
}

describe("NodeInspectorTelemetryPresenter – focused item mode", () => {
  describe("language model timeline — focused mode", () => {
    it("shows the FULL item subtree (all rounds for that item) when focusing on one of its invocations", () => {
      const traceView = makeEmptyTraceView({
        spans: [
          {
            traceId: BASE_TRACE_ID,
            spanId: "span_a1",
            runId: BASE_RUN_ID,
            workflowId: BASE_WORKFLOW_ID,
            connectionInvocationId: "inv_a1",
            name: "gen_ai.chat.completion",
            kind: "client",
            status: "completed",
            startTime: "2026-01-01T00:00:00.000Z",
            endTime: "2026-01-01T00:00:01.000Z",
            modelName: "gpt-4o",
          },
          {
            traceId: BASE_TRACE_ID,
            spanId: "span_a2",
            runId: BASE_RUN_ID,
            workflowId: BASE_WORKFLOW_ID,
            connectionInvocationId: "inv_a2",
            name: "gen_ai.chat.completion",
            kind: "client",
            status: "completed",
            startTime: "2026-01-01T00:00:02.000Z",
            endTime: "2026-01-01T00:00:03.000Z",
            modelName: "gpt-4o",
          },
          {
            traceId: BASE_TRACE_ID,
            spanId: "span_b1",
            runId: BASE_RUN_ID,
            workflowId: BASE_WORKFLOW_ID,
            connectionInvocationId: "inv_b1",
            name: "gen_ai.chat.completion",
            kind: "client",
            status: "completed",
            startTime: "2026-01-01T00:00:10.000Z",
            endTime: "2026-01-01T00:00:11.000Z",
            modelName: "gpt-4o",
          },
        ],
      });

      const invocations: ConnectionInvocationRecord[] = [
        makeLlmInvocation("inv_a1", "act_a", "2026-01-01T00:00:00.000Z"),
        makeLlmInvocation("inv_a2", "act_a", "2026-01-01T00:00:02.000Z"),
        makeLlmInvocation("inv_b1", "act_b", "2026-01-01T00:00:10.000Z"),
      ];

      const model = NodeInspectorTelemetryPresenter.create({
        node: {
          id: LLM_NODE_ID,
          kind: "node",
          type: "OpenAiChatModel",
          name: "Chat model",
          role: "languageModel",
        },
        nodeSnapshotsByNodeId: {},
        connectionInvocations: invocations,
        traceView,
        focusedInvocationId: "inv_a2",
      });

      const section = model.sections.find((s) => s.id === "language-model-timeline");
      expect(section).toBeDefined();

      // Focused mode renders ONE Item entry whose children are ALL rounds in that item.
      expect(section?.timeline).toHaveLength(1);
      const itemEntry = section?.timeline?.[0];
      expect(itemEntry?.title).toBe("Item 1");
      expect(itemEntry?.children?.map((child) => child.key)).toEqual(["span_a1", "span_a2"]);

      // Breadcrumb is per-item only (no "Round" anymore).
      expect(section?.breadcrumb?.text).toBe("Item 1 of 2");
      expect(section?.breadcrumb?.text).not.toContain("Round");

      // Navigation steps to the first invocation of the neighbouring items.
      expect(section?.navigation?.focusedInvocationId).toBe("inv_a2");
      expect(section?.navigation?.prev).toBeNull();
      expect(section?.navigation?.next?.invocationId).toBe("inv_b1");
    });

    it("focusing on a different round of the same item produces the same Item subtree (only nav focus differs)", () => {
      const invocations: ConnectionInvocationRecord[] = [
        makeLlmInvocation("inv_a1", "act_a", "2026-01-01T00:00:00.000Z"),
        makeLlmInvocation("inv_a2", "act_a", "2026-01-01T00:00:02.000Z"),
      ];

      const focusOnA1 = NodeInspectorTelemetryPresenter.create({
        node: {
          id: LLM_NODE_ID,
          kind: "node",
          type: "OpenAiChatModel",
          name: "Chat model",
          role: "languageModel",
        },
        nodeSnapshotsByNodeId: {},
        connectionInvocations: invocations,
        traceView: makeEmptyTraceView(),
        focusedInvocationId: "inv_a1",
      });

      const focusOnA2 = NodeInspectorTelemetryPresenter.create({
        node: {
          id: LLM_NODE_ID,
          kind: "node",
          type: "OpenAiChatModel",
          name: "Chat model",
          role: "languageModel",
        },
        nodeSnapshotsByNodeId: {},
        connectionInvocations: invocations,
        traceView: makeEmptyTraceView(),
        focusedInvocationId: "inv_a2",
      });

      const sectionA1 = focusOnA1.sections.find((s) => s.id === "language-model-timeline");
      const sectionA2 = focusOnA2.sections.find((s) => s.id === "language-model-timeline");
      expect(sectionA1?.timeline).toHaveLength(1);
      expect(sectionA2?.timeline).toHaveLength(1);
      expect(sectionA1?.timeline?.[0]?.children?.length).toBe(2);
      expect(sectionA2?.timeline?.[0]?.children?.length).toBe(2);
    });

    it("hides navigation entirely when there is only ONE item", () => {
      const invocations: ConnectionInvocationRecord[] = [
        makeLlmInvocation("inv_a1", "act_a", "2026-01-01T00:00:00.000Z"),
        makeLlmInvocation("inv_a2", "act_a", "2026-01-01T00:00:02.000Z"),
      ];

      const model = NodeInspectorTelemetryPresenter.create({
        node: {
          id: LLM_NODE_ID,
          kind: "node",
          type: "OpenAiChatModel",
          name: "Chat model",
          role: "languageModel",
        },
        nodeSnapshotsByNodeId: {},
        connectionInvocations: invocations,
        traceView: makeEmptyTraceView(),
        focusedInvocationId: "inv_a1",
      });

      const section = model.sections.find((s) => s.id === "language-model-timeline");
      expect(section?.breadcrumb?.text).toBe("Item 1 of 1");
      expect(section?.navigation).toBeUndefined();
    });
  });

  describe("tool timeline — focused mode", () => {
    it("breadcrumb is per-item (no 'Call N of M') and timeline is the item subtree", () => {
      const invocations: ConnectionInvocationRecord[] = [
        makeToolInvocation("inv_t1", "act_a", "2026-01-01T00:00:00.000Z"),
        makeToolInvocation("inv_t2", "act_a", "2026-01-01T00:00:02.000Z"),
        makeToolInvocation("inv_t3", "act_b", "2026-01-01T00:00:10.000Z"),
      ];

      const model = NodeInspectorTelemetryPresenter.create({
        node: {
          id: TOOL_NODE_ID,
          kind: "node",
          type: "ToolConnection",
          name: "Search",
          role: "tool",
        },
        nodeSnapshotsByNodeId: {},
        connectionInvocations: invocations,
        traceView: makeEmptyTraceView(),
        focusedInvocationId: "inv_t2",
      });

      const section = model.sections.find((s) => s.id === "tool-timeline");
      expect(section?.breadcrumb?.text).toBe("Item 1 of 2");
      expect(section?.breadcrumb?.text).not.toContain("Call");
      expect(section?.timeline).toHaveLength(1);
      expect(section?.timeline?.[0]?.children?.length).toBe(2);
      expect(section?.navigation?.next?.invocationId).toBe("inv_t3");
    });
  });

  describe("fallback to grouped accordion when focusedInvocationId doesn't belong to the node", () => {
    it("no breadcrumb or navigation when focusedInvocationId belongs to a different node", () => {
      const invocations: ConnectionInvocationRecord[] = [
        makeLlmInvocation("inv_a1", "act_a", "2026-01-01T00:00:00.000Z"),
        makeLlmInvocation("inv_a2", "act_a", "2026-01-01T00:00:02.000Z"),
      ];

      const model = NodeInspectorTelemetryPresenter.create({
        node: {
          id: LLM_NODE_ID,
          kind: "node",
          type: "OpenAiChatModel",
          name: "Chat model",
          role: "languageModel",
        },
        nodeSnapshotsByNodeId: {},
        connectionInvocations: invocations,
        traceView: makeEmptyTraceView(),
        focusedInvocationId: "inv_from_other_node",
      });

      const section = model.sections.find((s) => s.id === "language-model-timeline");
      expect(section?.breadcrumb).toBeUndefined();
      expect(section?.navigation).toBeUndefined();
      expect(section?.timeline).toHaveLength(1);
    });
  });

  describe("no focusedInvocationId — grouped accordion unchanged", () => {
    it("produces grouped accordion when focusedInvocationId is undefined", () => {
      const invocations: ConnectionInvocationRecord[] = [
        makeLlmInvocation("inv_a1", "act_a", "2026-01-01T00:00:00.000Z"),
        makeLlmInvocation("inv_b1", "act_b", "2026-01-01T00:00:10.000Z"),
      ];

      const model = NodeInspectorTelemetryPresenter.create({
        node: {
          id: LLM_NODE_ID,
          kind: "node",
          type: "OpenAiChatModel",
          name: "Chat model",
          role: "languageModel",
        },
        nodeSnapshotsByNodeId: {},
        connectionInvocations: invocations,
        traceView: makeEmptyTraceView(),
      });

      const section = model.sections.find((s) => s.id === "language-model-timeline");
      expect(section?.breadcrumb).toBeUndefined();
      expect(section?.navigation).toBeUndefined();
      expect(section?.timeline).toHaveLength(2);
    });

    it("produces grouped accordion when focusedInvocationId is null", () => {
      const invocations: ConnectionInvocationRecord[] = [
        makeLlmInvocation("inv_a1", "act_a", "2026-01-01T00:00:00.000Z"),
        makeLlmInvocation("inv_b1", "act_b", "2026-01-01T00:00:10.000Z"),
      ];

      const model = NodeInspectorTelemetryPresenter.create({
        node: {
          id: LLM_NODE_ID,
          kind: "node",
          type: "OpenAiChatModel",
          name: "Chat model",
          role: "languageModel",
        },
        nodeSnapshotsByNodeId: {},
        connectionInvocations: invocations,
        traceView: makeEmptyTraceView(),
        focusedInvocationId: null,
      });

      const section = model.sections.find((s) => s.id === "language-model-timeline");
      expect(section?.breadcrumb).toBeUndefined();
      expect(section?.navigation).toBeUndefined();
      expect(section?.timeline).toHaveLength(2);
    });
  });
});
