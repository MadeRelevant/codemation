import type {
  NodeActivationContinuation,
  NodeActivationReceipt,
  NodeActivationRequest,
  NodeActivationScheduler,
  RunId,
} from "../types";
import { NodeExecutor } from "../execution/NodeExecutor";

export class InlineDrivingScheduler implements NodeActivationScheduler {
  private continuation: NodeActivationContinuation | undefined;
  private readonly drainingRuns = new Set<RunId>();
  private readonly queuesByRunId = new Map<
    RunId,
    Array<Readonly<{ request: NodeActivationRequest; receipt: NodeActivationReceipt }>>
  >();
  private readonly scheduledRuns = new Set<RunId>();
  private seq = 0;

  constructor(private readonly nodeExecutor: NodeExecutor) {}

  setContinuation(continuation: NodeActivationContinuation): void {
    this.continuation = continuation;
  }

  async enqueue(request: NodeActivationRequest): Promise<NodeActivationReceipt> {
    const receipt: NodeActivationReceipt = { receiptId: `inline_${++this.seq}`, mode: "local" };
    const q = this.queuesByRunId.get(request.runId) ?? [];
    q.push({ request, receipt });
    this.queuesByRunId.set(request.runId, q);

    return receipt;
  }

  notifyPendingStatePersisted(runId: RunId): void {
    if ((this.queuesByRunId.get(runId)?.length ?? 0) === 0) {
      return;
    }
    this.scheduleDrain(runId);
  }

  private async drainRun(runId: RunId): Promise<void> {
    if (this.drainingRuns.has(runId)) return;
    this.drainingRuns.add(runId);
    this.scheduledRuns.delete(runId);
    try {
      const q = this.queuesByRunId.get(runId) ?? [];
      while (q.length > 0) {
        const next = q.shift()!;
        const { request } = next;

        const cont = this.continuation;
        if (!cont) throw new Error("InlineDrivingScheduler is missing a continuation (setContinuation was not called)");

        await cont.markNodeRunning({
          runId: request.runId,
          activationId: request.activationId,
          nodeId: request.nodeId,
          inputsByPort: request.kind === "multi" ? request.inputsByPort : { in: request.input },
        });

        let outputs;
        try {
          outputs = await this.nodeExecutor.execute(request);
        } catch (e) {
          await this.resumeAfterExecutionError(cont, request, this.asError(e));
          continue;
        }

        await this.resumeAfterExecutionResult(cont, request, outputs ?? {});
      }
    } finally {
      if ((this.queuesByRunId.get(runId)?.length ?? 0) === 0) this.queuesByRunId.delete(runId);
      this.drainingRuns.delete(runId);
      if ((this.queuesByRunId.get(runId)?.length ?? 0) > 0) {
        this.scheduleDrain(runId);
      }
    }
  }

  private scheduleDrain(runId: RunId): void {
    if (this.drainingRuns.has(runId) || this.scheduledRuns.has(runId)) {
      return;
    }
    this.scheduledRuns.add(runId);
    setTimeout(() => {
      this.scheduledRuns.delete(runId);
      void this.drainRun(runId);
    }, 0);
  }

  private async resumeAfterExecutionResult(
    continuation: NodeActivationContinuation,
    request: NodeActivationRequest,
    outputs: unknown,
  ): Promise<void> {
    try {
      await continuation.resumeFromNodeResult({
        runId: request.runId,
        activationId: request.activationId,
        nodeId: request.nodeId,
        outputs: outputs as any,
      });
    } catch (e) {
      this.rethrowUnlessIgnorableContinuationError(e);
    }
  }

  private async resumeAfterExecutionError(
    continuation: NodeActivationContinuation,
    request: NodeActivationRequest,
    error: Error,
  ): Promise<void> {
    try {
      await continuation.resumeFromNodeError({
        runId: request.runId,
        activationId: request.activationId,
        nodeId: request.nodeId,
        error,
      });
    } catch (e) {
      this.rethrowUnlessIgnorableContinuationError(e);
    }
  }

  private asError(e: unknown): Error {
    return e instanceof Error ? e : new Error(String(e));
  }

  private rethrowUnlessIgnorableContinuationError(e: unknown): void {
    if (this.isIgnorableContinuationError(e)) {
      return;
    }
    throw this.asError(e);
  }

  private isIgnorableContinuationError(e: unknown): boolean {
    const message = this.asError(e).message;
    return (
      message.includes(" is not pending") ||
      message.includes("activationId mismatch") ||
      message.includes("nodeId mismatch")
    );
  }
}
