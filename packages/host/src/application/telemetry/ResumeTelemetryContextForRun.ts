import { inject, injectable } from "@codemation/core";
import type { ExecutionTelemetry } from "@codemation/core";
import type { HumanTaskStore } from "@codemation/core";
import { HumanTaskStoreToken } from "@codemation/core";
import { OtelExecutionTelemetryFactory } from "./OtelExecutionTelemetryFactory";

/**
 * Reconstructs an {@link ExecutionTelemetry} scope for a run that is resuming from a
 * `pending` HITL state.
 *
 * **Trace context note:** When the decide/timeout/cancel endpoint fires, the original
 * run's OTel trace context is not available (different HTTP request, no propagation header).
 * The `traceId` and root `spanId` are re-derived deterministically from `runId` using the
 * same {@link OtelIdentityFactory} hashing that was used at run-start time. This means the
 * span events emitted here (`hitl.task.decided`, `hitl.task.timed_out`, `hitl.task.cancelled`)
 * are correctly routed into the run's existing trace tree in the span store — the join is
 * by `traceId` / `runId`, not by a live in-process scope.
 *
 * If a future requirement calls for full W3C trace-context propagation across the
 * suspend/resume boundary, store `traceId` + parent `spanId` on the `HumanTask` row and
 * restore them here instead of re-deriving.
 */
@injectable()
export class ResumeTelemetryContextForRun {
  private readonly taskStore: HumanTaskStore | undefined;

  constructor(
    @inject(OtelExecutionTelemetryFactory) private readonly telemetryFactory: OtelExecutionTelemetryFactory,
    @inject(HumanTaskStoreToken) taskStore: HumanTaskStore | undefined,
  ) {
    this.taskStore = taskStore;
  }

  /**
   * Returns an {@link ExecutionTelemetry} scope keyed to the run's trace, or `undefined`
   * when the task store is not available or the task is not found.
   *
   * Loads `workflowId` from the task record so callers don't need to look it up separately.
   */
  async forTask(taskId: string): Promise<ExecutionTelemetry | undefined> {
    if (!this.taskStore) {
      return undefined;
    }
    const task = await this.taskStore.findById(taskId);
    if (!task) {
      return undefined;
    }
    return this.telemetryFactory.create({
      runId: task.runId,
      workflowId: task.workflowId,
    });
  }
}
