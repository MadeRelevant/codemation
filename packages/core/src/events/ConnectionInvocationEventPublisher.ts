import type { ConnectionInvocationRecord } from "../contracts/runTypes";
import type { ParentExecutionRef } from "../types";
import type { RunEventBus } from "./runEvents";

/**
 * Publishes per-invocation lifecycle records onto the run {@link RunEventBus}.
 *
 * Surgical, per-invocation events let the UI update the right-side inspector
 * timeline as each LLM round / tool call transitions through `running` → `completed`
 * (or `failed`) without depending on a coarse `runSaved` poll.
 */
export class ConnectionInvocationEventPublisher {
  constructor(
    private readonly eventBus: RunEventBus | undefined,
    private readonly parent: ParentExecutionRef | undefined,
  ) {}

  async publish(record: ConnectionInvocationRecord): Promise<void> {
    if (!this.eventBus) return;
    const kind = this.kindFor(record);
    if (!kind) return;
    await this.eventBus.publish({
      kind,
      runId: record.runId,
      workflowId: record.workflowId,
      parent: this.parent,
      at: record.updatedAt,
      record,
    });
  }

  private kindFor(
    record: ConnectionInvocationRecord,
  ): "connectionInvocationStarted" | "connectionInvocationCompleted" | "connectionInvocationFailed" | undefined {
    if (record.status === "running" || record.status === "queued") {
      return "connectionInvocationStarted";
    }
    if (record.status === "completed") {
      return "connectionInvocationCompleted";
    }
    if (record.status === "failed") {
      return "connectionInvocationFailed";
    }
    return undefined;
  }
}
