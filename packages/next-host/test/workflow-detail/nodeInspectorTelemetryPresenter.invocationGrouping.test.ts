import { describe, expect, it } from "vitest";
import type {
  ConnectionInvocationRecord,
  TelemetryRunTraceViewDto,
} from "../../src/features/workflows/hooks/realtime/realtime";
import { NodeInspectorTelemetryPresenter } from "../../src/features/workflows/lib/workflowDetail/NodeInspectorTelemetryPresenter";

const BASE_TRACE_ID = "trace_group_test";
const BASE_RUN_ID = "run_group_test";
const BASE_WORKFLOW_ID = "wf.group_test";

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

describe("NodeInspectorTelemetryPresenter – invocation grouping", () => {
  describe("language model timeline groups invocations by iterationId", () => {
    it("produces one item entry per distinct iterationId, ordered by itemIndex", () => {
      const traceView = makeEmptyTraceView({
        spans: [
          {
            traceId: BASE_TRACE_ID,
            spanId: "span_llm_a1",
            runId: BASE_RUN_ID,
            workflowId: BASE_WORKFLOW_ID,
            connectionInvocationId: "inv_llm_a1",
            name: "gen_ai.chat.completion",
            kind: "client",
            status: "completed",
            startTime: "2026-01-01T00:00:00.000Z",
            endTime: "2026-01-01T00:00:01.000Z",
            modelName: "gpt-4o",
          },
          {
            traceId: BASE_TRACE_ID,
            spanId: "span_llm_a2",
            runId: BASE_RUN_ID,
            workflowId: BASE_WORKFLOW_ID,
            connectionInvocationId: "inv_llm_a2",
            name: "gen_ai.chat.completion",
            kind: "client",
            status: "completed",
            startTime: "2026-01-01T00:00:02.000Z",
            endTime: "2026-01-01T00:00:03.000Z",
            modelName: "gpt-4o",
          },
          {
            traceId: BASE_TRACE_ID,
            spanId: "span_llm_b1",
            runId: BASE_RUN_ID,
            workflowId: BASE_WORKFLOW_ID,
            connectionInvocationId: "inv_llm_b1",
            name: "gen_ai.chat.completion",
            kind: "client",
            status: "completed",
            startTime: "2026-01-01T00:00:10.000Z",
            endTime: "2026-01-01T00:00:11.000Z",
            modelName: "gpt-4o",
          },
        ],
      });

      const model = NodeInspectorTelemetryPresenter.create({
        node: {
          id: "AIAgentNode$1:1__conn__llm",
          kind: "node",
          type: "OpenAiChatModel",
          name: "Chat model",
          role: "languageModel",
        },
        nodeSnapshotsByNodeId: {},
        connectionInvocations: [
          {
            invocationId: "inv_llm_a1",
            runId: BASE_RUN_ID,
            workflowId: BASE_WORKFLOW_ID,
            connectionNodeId: "AIAgentNode$1:1__conn__llm",
            parentAgentNodeId: "agent_main",
            parentAgentActivationId: "act_a",
            status: "completed",
            startedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:01.000Z",
            iterationId: "iter_item_0",
            itemIndex: 0,
          } satisfies ConnectionInvocationRecord,
          {
            invocationId: "inv_llm_a2",
            runId: BASE_RUN_ID,
            workflowId: BASE_WORKFLOW_ID,
            connectionNodeId: "AIAgentNode$1:1__conn__llm",
            parentAgentNodeId: "agent_main",
            parentAgentActivationId: "act_a",
            status: "completed",
            startedAt: "2026-01-01T00:00:02.000Z",
            updatedAt: "2026-01-01T00:00:03.000Z",
            iterationId: "iter_item_0",
            itemIndex: 0,
          } satisfies ConnectionInvocationRecord,
          {
            invocationId: "inv_llm_b1",
            runId: BASE_RUN_ID,
            workflowId: BASE_WORKFLOW_ID,
            connectionNodeId: "AIAgentNode$1:1__conn__llm",
            parentAgentNodeId: "agent_main",
            parentAgentActivationId: "act_a",
            status: "completed",
            startedAt: "2026-01-01T00:00:10.000Z",
            updatedAt: "2026-01-01T00:00:11.000Z",
            iterationId: "iter_item_1",
            itemIndex: 1,
          } satisfies ConnectionInvocationRecord,
        ],
        traceView,
      });

      const timeline = model.sections.find((s) => s.id === "language-model-timeline");
      expect(timeline).toBeDefined();
      expect(timeline?.timeline).toHaveLength(2);

      const item1 = timeline?.timeline?.[0];
      const item2 = timeline?.timeline?.[1];

      expect(item1?.title).toBe("Item 1");
      expect(item1?.kind).toBe("agent");
      expect(item1?.pills).toEqual([{ label: "Rounds", value: "2" }]);
      expect(item1?.children).toHaveLength(2);
      expect(item1?.key).toBe("iter_item_0");

      expect(item2?.title).toBe("Item 2");
      expect(item2?.kind).toBe("agent");
      expect(item2?.pills).toEqual([{ label: "Rounds", value: "1" }]);
      expect(item2?.children).toHaveLength(1);
      expect(item2?.key).toBe("iter_item_1");

      expect(item1?.children?.map((c) => c.key)).toEqual(["span_llm_a1", "span_llm_a2"]);
      expect(item2?.children?.map((c) => c.key)).toEqual(["span_llm_b1"]);
    });

    it("orders items by itemIndex even when iterations finish out of order", () => {
      const traceView = makeEmptyTraceView();
      const model = NodeInspectorTelemetryPresenter.create({
        node: {
          id: "AIAgentNode$1:1__conn__llm",
          kind: "node",
          type: "OpenAiChatModel",
          name: "Chat model",
          role: "languageModel",
        },
        nodeSnapshotsByNodeId: {},
        connectionInvocations: [
          {
            invocationId: "inv_late",
            runId: BASE_RUN_ID,
            workflowId: BASE_WORKFLOW_ID,
            connectionNodeId: "AIAgentNode$1:1__conn__llm",
            parentAgentNodeId: "agent_main",
            parentAgentActivationId: "act_a",
            status: "completed",
            startedAt: "2026-01-01T00:00:00.500Z",
            updatedAt: "2026-01-01T00:00:01.000Z",
            iterationId: "iter_item_1",
            itemIndex: 1,
          } satisfies ConnectionInvocationRecord,
          {
            invocationId: "inv_early",
            runId: BASE_RUN_ID,
            workflowId: BASE_WORKFLOW_ID,
            connectionNodeId: "AIAgentNode$1:1__conn__llm",
            parentAgentNodeId: "agent_main",
            parentAgentActivationId: "act_a",
            status: "completed",
            startedAt: "2026-01-01T00:00:02.000Z",
            updatedAt: "2026-01-01T00:00:03.000Z",
            iterationId: "iter_item_0",
            itemIndex: 0,
          } satisfies ConnectionInvocationRecord,
        ],
        traceView,
      });

      const timeline = model.sections.find((s) => s.id === "language-model-timeline");
      const titles = timeline?.timeline?.map((entry) => entry.title) ?? [];
      expect(titles).toEqual(["Item 1", "Item 2"]);
      expect(timeline?.timeline?.[0]?.key).toBe("iter_item_0");
      expect(timeline?.timeline?.[1]?.key).toBe("iter_item_1");
    });
  });

  describe("legacy invocations without iterationId fall back to grouping by parentAgentActivationId", () => {
    it("groups legacy invocations into one Item per activation when iterationId is missing", () => {
      const traceView = makeEmptyTraceView();
      const model = NodeInspectorTelemetryPresenter.create({
        node: {
          id: "AIAgentNode$1:1__conn__llm",
          kind: "node",
          type: "OpenAiChatModel",
          name: "Chat model",
          role: "languageModel",
        },
        nodeSnapshotsByNodeId: {},
        connectionInvocations: [
          {
            invocationId: "inv_named",
            runId: BASE_RUN_ID,
            workflowId: BASE_WORKFLOW_ID,
            connectionNodeId: "AIAgentNode$1:1__conn__llm",
            parentAgentNodeId: "agent_main",
            parentAgentActivationId: "act_legacy",
            status: "completed",
            startedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:01.000Z",
          } satisfies ConnectionInvocationRecord,
          {
            invocationId: "inv_unscoped",
            runId: BASE_RUN_ID,
            workflowId: BASE_WORKFLOW_ID,
            connectionNodeId: "AIAgentNode$1:1__conn__llm",
            parentAgentNodeId: "agent_main",
            parentAgentActivationId: undefined as unknown as string,
            status: "completed",
            startedAt: "2026-01-01T00:00:10.000Z",
            updatedAt: "2026-01-01T00:00:11.000Z",
          } satisfies ConnectionInvocationRecord,
        ],
        traceView,
      });

      const timeline = model.sections.find((s) => s.id === "language-model-timeline");
      expect(timeline?.timeline).toHaveLength(2);
      const keys = timeline?.timeline?.map((entry) => entry.key) ?? [];
      const legacyKey = keys.find((key) => key.startsWith("legacy::act_legacy"));
      expect(legacyKey).toBeTruthy();
      const unscopedKey = keys.find((key) => key !== legacyKey);
      expect(typeof unscopedKey).toBe("string");
      expect(unscopedKey?.length).toBeGreaterThan(0);
    });
  });

  describe("single-item run still wraps invocations in Item 1", () => {
    it("produces a single Item 1 wrapper when there is one iteration", () => {
      const traceView = makeEmptyTraceView({
        spans: [
          {
            traceId: BASE_TRACE_ID,
            spanId: "span_single",
            runId: BASE_RUN_ID,
            workflowId: BASE_WORKFLOW_ID,
            connectionInvocationId: "inv_single",
            name: "gen_ai.chat.completion",
            kind: "client",
            status: "completed",
            startTime: "2026-01-01T00:00:00.000Z",
            endTime: "2026-01-01T00:00:01.000Z",
            modelName: "gpt-4o-mini",
          },
        ],
      });

      const model = NodeInspectorTelemetryPresenter.create({
        node: {
          id: "AIAgentNode$1:1__conn__llm",
          kind: "node",
          type: "OpenAiChatModel",
          name: "Chat model",
          role: "languageModel",
        },
        nodeSnapshotsByNodeId: {},
        connectionInvocations: [
          {
            invocationId: "inv_single",
            runId: BASE_RUN_ID,
            workflowId: BASE_WORKFLOW_ID,
            connectionNodeId: "AIAgentNode$1:1__conn__llm",
            parentAgentNodeId: "agent_main",
            parentAgentActivationId: "act_solo",
            status: "completed",
            startedAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:01.000Z",
            iterationId: "iter_solo",
            itemIndex: 0,
          } satisfies ConnectionInvocationRecord,
        ],
        traceView,
      });

      const timeline = model.sections.find((s) => s.id === "language-model-timeline");
      expect(timeline?.timeline).toHaveLength(1);
      expect(timeline?.timeline?.[0]?.title).toBe("Item 1");
      expect(timeline?.timeline?.[0]?.children).toHaveLength(1);
      expect(timeline?.timeline?.[0]?.children?.[0]?.key).toBe("span_single");
    });
  });
});
