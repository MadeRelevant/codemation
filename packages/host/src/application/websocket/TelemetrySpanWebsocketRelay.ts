import { inject, injectable } from "@codemation/core";
import type { TelemetrySpanUpsert } from "../../domain/telemetry/TelemetryContracts";
import { ApplicationTokens } from "../../applicationTokens";
import type { TelemetrySpanPublisher } from "../telemetry/TelemetrySpanPublisher";
import type { WorkflowWebsocketPublisher } from "./WorkflowWebsocketPublisher";

/**
 * Implements {@link TelemetrySpanPublisher} by forwarding each span upsert to a
 * per-run WebSocket room (`run:<runId>`). Clients subscribe to this room when they
 * open the inspector for a specific run.
 *
 * The relay fires *after* the span has been committed to persistent storage so that
 * HTTP catch-up (on reconnect or initial mount) and WS pushes represent a consistent
 * view of the data.
 */
@injectable()
export class TelemetrySpanWebsocketRelay implements TelemetrySpanPublisher {
  constructor(
    @inject(ApplicationTokens.WorkflowWebsocketPublisher)
    private readonly workflowWebsocketPublisher: WorkflowWebsocketPublisher,
  ) {}

  async publishSpan(span: TelemetrySpanUpsert): Promise<void> {
    const roomId = `run:${span.runId}`;
    await this.workflowWebsocketPublisher.publishToRoom(roomId, {
      kind: "telemetryEvent",
      runId: span.runId,
      span,
    });
  }
}
