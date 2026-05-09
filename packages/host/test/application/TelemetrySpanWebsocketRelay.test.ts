import { describe, it, expect, beforeEach } from "vitest";
import type { TelemetrySpanUpsert } from "../../src/domain/telemetry/TelemetryContracts";
import type { WorkflowWebsocketMessage } from "../../src/application/contracts/WorkflowWebsocketMessage";
import type { WorkflowWebsocketPublisher } from "../../src/application/websocket/WorkflowWebsocketPublisher";
import { TelemetrySpanWebsocketRelay } from "../../src/application/websocket/TelemetrySpanWebsocketRelay";

describe("TelemetrySpanWebsocketRelay", () => {
  let publishedRooms: Array<{ roomId: string; message: WorkflowWebsocketMessage }>;
  let publisher: WorkflowWebsocketPublisher;
  let relay: TelemetrySpanWebsocketRelay;

  beforeEach(() => {
    publishedRooms = [];
    publisher = {
      async publishToRoom(roomId: string, message: WorkflowWebsocketMessage): Promise<void> {
        publishedRooms.push({ roomId, message });
      },
    };
    relay = new TelemetrySpanWebsocketRelay(publisher);
  });

  it("publishes to run:<runId> room with telemetryEvent kind", async () => {
    const span: TelemetrySpanUpsert = {
      traceId: "trace_abc",
      spanId: "span_1",
      runId: "run_xyz",
      workflowId: "wf_test",
      name: "workflow.node",
      kind: "internal",
      status: "running",
      startTime: new Date().toISOString(),
    };

    await relay.publishSpan(span);

    expect(publishedRooms).toHaveLength(1);
    const published = publishedRooms[0]!;
    expect(published.roomId).toBe("run:run_xyz");
    expect(published.message.kind).toBe("telemetryEvent");
    if (published.message.kind === "telemetryEvent") {
      expect(published.message.runId).toBe("run_xyz");
      expect(published.message.span).toBe(span);
    }
  });

  it("uses the runId from the span for the room key", async () => {
    const span: TelemetrySpanUpsert = {
      traceId: "trace_123",
      spanId: "span_2",
      runId: "run_abc123",
      workflowId: "wf_foo",
      kind: "client",
    };

    await relay.publishSpan(span);

    expect(publishedRooms[0]?.roomId).toBe("run:run_abc123");
  });

  it("forwards the full span payload", async () => {
    const span: TelemetrySpanUpsert = {
      traceId: "trace_full",
      spanId: "span_full",
      parentSpanId: "span_parent",
      runId: "run_full",
      workflowId: "wf_full",
      nodeId: "node_1",
      activationId: "act_1",
      name: "gen_ai.chat.completion",
      kind: "client",
      status: "completed",
      startTime: "2024-01-01T00:00:00.000Z",
      endTime: "2024-01-01T00:00:01.000Z",
      modelName: "gpt-4",
    };

    await relay.publishSpan(span);

    const published = publishedRooms[0]!;
    if (published.message.kind === "telemetryEvent") {
      expect(published.message.span).toStrictEqual(span);
    }
  });
});
