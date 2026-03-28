import type { RunEventBus } from "./runEvents";
import type { NodeExecutionSnapshot } from "../types";

/** Publishes node lifecycle snapshots onto the run {@link RunEventBus}. */
export class NodeEventPublisher {
  constructor(private readonly eventBus: RunEventBus | undefined) {}

  async publish(
    kind: "nodeQueued" | "nodeStarted" | "nodeCompleted" | "nodeFailed",
    snapshot: NodeExecutionSnapshot,
  ): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.publish({
      kind,
      runId: snapshot.runId,
      workflowId: snapshot.workflowId,
      parent: snapshot.parent,
      at: snapshot.updatedAt,
      snapshot,
    });
  }
}
