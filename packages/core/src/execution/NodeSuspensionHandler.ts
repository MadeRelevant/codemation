import { createHash } from "node:crypto";
import { z } from "zod";

import type { HitlResumeTokenSignerSeam, HitlTimeoutJobSchedulerSeam } from "../contracts/hitlSeamTypes";
import type { HumanTaskRecord, HumanTaskStore } from "../contracts/humanTaskStoreTypes";
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
 * 2. Persist a `HumanTask` row via `HumanTaskStore.create` (story 02).
 * 3. Sign a resume URL via `HitlResumeTokenSigner.sign` (story 02).
 * 4. Enqueue a delayed BullMQ timeout job via `HitlTimeoutJobScheduler.enqueue` (story 02).
 * 5. Build a `HumanTaskHandle` and call `deliver`.
 * 6. Append a `PersistedSuspensionEntry` to the run state and flip status to `"suspended"`.
 * 7. Persist via `WorkflowExecutionRepository.save`.
 * 8. Throw `RunSuspendedError` so the caller can exit cleanly.
 *
 * If `deliver` throws, the error propagates up to `NodeExecutionRequestHandlerService`
 * which routes it through `resumeFromNodeError` → run status becomes `"failed"`.
 *
 * Story 02: `humanTaskStore`, `tokenSigner`, and `timeoutScheduler` are optional —
 * when not registered (e.g. in unit tests), the handler still suspends the run but
 * skips persistence, token signing, and job scheduling.
 */
export class NodeSuspensionHandler {
  constructor(
    private readonly workflowExecutionRepository: WorkflowExecutionRepository,
    private readonly humanTaskStore?: HumanTaskStore,
    private readonly tokenSigner?: HitlResumeTokenSignerSeam,
    private readonly timeoutScheduler?: HitlTimeoutJobSchedulerSeam,
  ) {}

  async handle(args: {
    runId: RunId;
    nodeId: NodeId;
    activationId: NodeActivationId;
    itemIndex: number;
    suspensionRequest: SuspensionRequest;
    state: PersistedRunState;
  }): Promise<never> {
    const taskId = `htask_${globalThis.crypto.randomUUID()}`;
    const { timeout, onTimeout, deliver, decisionSchema, subject, metadata } = args.suspensionRequest.request;

    const timeoutMs = this.parseDurationMs(timeout);
    const expiresAt = new Date(Date.now() + timeoutMs);

    const decisionSchemaHash = this.hashSchema(decisionSchema);
    const decisionSchemaJson = this.schemaToJson(decisionSchema);

    // Build resume token (when signer is available)
    let resumeUrl = "";
    let resumeTokenHash = "";
    if (this.tokenSigner) {
      const token = this.tokenSigner.sign({ taskId, expiresAt, schemaHash: decisionSchemaHash });
      resumeUrl = token; // callers (deliver) receive the raw token; inbox layers wrap into a URL
      resumeTokenHash = this.tokenSigner.hashToken(token);
    }

    const handle: HumanTaskHandle = {
      taskId,
      runId: args.runId,
      nodeId: args.nodeId,
      expiresAt,
      resumeUrl,
      ...(metadata !== undefined ? { metadata } : {}),
    };

    // D5: deliver throws → propagate upward; caller routes to resumeFromNodeError → "failed"
    const deliveryRef = await deliver(handle);

    // Persist HumanTask row (story 02)
    if (this.humanTaskStore) {
      const record: HumanTaskRecord = {
        id: taskId,
        runId: args.runId,
        workflowId: args.state.workflowId,
        nodeId: args.nodeId,
        activationId: args.activationId,
        itemIndex: args.itemIndex,
        status: "pending",
        channel: "local",
        subject,
        metadata: (metadata as Record<string, import("../contracts/workflowTypes").JsonValue>) ?? {},
        decisionSchemaJson,
        decisionSchemaHash,
        onTimeout,
        deliveryRef,
        resumeTokenHash: resumeTokenHash || "no-token",
        expiresAt,
        createdAt: new Date(),
      };
      await this.humanTaskStore.create(record);
    }

    // Enqueue timeout job (story 02)
    if (this.timeoutScheduler) {
      await this.timeoutScheduler.enqueueTimeoutJob({ taskId, expiresAt });
    }

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

  private hashSchema(schema: unknown): string {
    const json = this.schemaToJson(schema);
    return createHash("sha256").update(json).digest("hex");
  }

  private schemaToJson(schema: unknown): string {
    if (schema instanceof z.ZodType) {
      return JSON.stringify(z.toJSONSchema(schema));
    }
    if (typeof (schema as { toJSON?: unknown }).toJSON === "function") {
      return JSON.stringify((schema as { toJSON: () => unknown }).toJSON());
    }
    return JSON.stringify(schema);
  }
}
