import { createHash } from "node:crypto";

import type {
  HumanTaskHandle,
  NodeActivationId,
  NodeId,
  PersistedRunState,
  PersistedSuspensionEntry,
  RunId,
  SuspensionRequest,
  WorkflowExecutionRepository,
} from "../types";

import { RunSuspendedError } from "./RunSuspendedError";
export { RunSuspendedError };

/**
 * Handles per-item `SuspensionRequest` catches in the engine's item execution loop.
 *
 * Responsibilities:
 * 1. Generate a `taskId` (UUID v4).
 * 2. Build a `HumanTaskHandle` for the `deliver` callback.
 * 3. Call `deliver` and await the delivery payload.
 * 4. Append a `PersistedSuspensionEntry` to the run state and flip status to `"suspended"`.
 * 5. Persist via `WorkflowExecutionRepository.save`.
 * 6. Throw `RunSuspendedError` so the caller can exit cleanly.
 *
 * If `deliver` throws, the error propagates up to `NodeExecutionRequestHandlerService`
 * which routes it through `resumeFromNodeError` → run status becomes `"failed"` (D5).
 */
export class NodeSuspensionHandler {
  constructor(private readonly workflowExecutionRepository: WorkflowExecutionRepository) {}

  async handle(args: {
    runId: RunId;
    nodeId: NodeId;
    activationId: NodeActivationId;
    itemIndex: number;
    suspensionRequest: SuspensionRequest;
    state: PersistedRunState;
  }): Promise<never> {
    const taskId = `htask_${globalThis.crypto.randomUUID()}`;
    const { timeout, onTimeout, deliver, decisionSchema } = args.suspensionRequest.request;

    const timeoutMs = this.parseDurationMs(timeout);
    const expiresAt = new Date(Date.now() + timeoutMs);

    const handle: HumanTaskHandle = {
      taskId,
      runId: args.runId,
      nodeId: args.nodeId,
      expiresAt,
      // TODO(story-02): replace with real signed resume URL
      resumeUrl: "",
      ...(args.suspensionRequest.request.metadata !== undefined
        ? { metadata: args.suspensionRequest.request.metadata }
        : {}),
    };

    // D5: deliver throws → propagate upward; caller routes to resumeFromNodeError → "failed"
    const deliveryRef = await deliver(handle);

    const decisionSchemaHash = this.hashSchema(decisionSchema);

    const entry: PersistedSuspensionEntry = {
      taskId,
      nodeId: args.nodeId,
      activationId: args.activationId,
      itemIndex: args.itemIndex,
      decisionSchemaHash,
      deliveryRef,
      timeoutAt: expiresAt.toISOString(),
      onTimeout,
    };

    const existingSuspensions = args.state.suspension ?? [];
    const updatedState: PersistedRunState = {
      ...args.state,
      status: "suspended",
      suspension: [...existingSuspensions, entry],
    };

    await this.workflowExecutionRepository.save(updatedState);

    throw new RunSuspendedError(args.runId, taskId);
  }

  /**
   * Parse a duration string into milliseconds.
   * Accepts ISO 8601 durations ("PT24H", "PT30M") and shorthand ("24h", "30m", "1d").
   * Throws for unrecognised formats.
   */
  private parseDurationMs(duration: string): number {
    // Shorthand: "24h", "30m", "7d", "3600s"
    const shorthand = /^(\d+(?:\.\d+)?)(s|m|h|d)$/i.exec(duration);
    if (shorthand) {
      const value = parseFloat(shorthand[1]!);
      const unit = shorthand[2]!.toLowerCase();
      const multipliers: Record<string, number> = {
        s: 1_000,
        m: 60_000,
        h: 3_600_000,
        d: 86_400_000,
      };
      return value * multipliers[unit]!;
    }
    // ISO 8601 duration subset: PTnHnMnS (days handled via P1D)
    const iso = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(duration);
    if (iso) {
      const days = parseFloat(iso[1] ?? "0");
      const hours = parseFloat(iso[2] ?? "0");
      const minutes = parseFloat(iso[3] ?? "0");
      const seconds = parseFloat(iso[4] ?? "0");
      return (days * 86_400 + hours * 3_600 + minutes * 60 + seconds) * 1_000;
    }
    throw new Error(`NodeSuspensionHandler: unrecognised duration format: "${duration}"`);
  }

  private hashSchema(schema: { toJSON?: () => unknown } | unknown): string {
    const json =
      typeof (schema as { toJSON?: unknown }).toJSON === "function"
        ? JSON.stringify((schema as { toJSON: () => unknown }).toJSON())
        : JSON.stringify(schema);
    return createHash("sha256").update(json).digest("hex");
  }
}
