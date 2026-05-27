import type { RunId } from "../types";

/**
 * Internal sentinel thrown by {@link NodeSuspensionHandler} after persisting a suspension
 * entry. `NodeExecutionRequestHandlerService` catches this specifically and returns cleanly —
 * no continuation call, preventing `resumeFromNodeResult` / `resumeFromNodeError` from
 * overwriting the `"suspended"` run status.
 *
 * The `Error` suffix satisfies the ESLint `no-manual-di-new` allowlist. This is NOT a
 * user-facing error — it is an engine-internal control-flow primitive and should NOT be
 * exported from the public barrel.
 */
export class RunSuspendedError extends Error {
  constructor(
    readonly runId: RunId,
    readonly taskId: string,
  ) {
    super(`RunSuspendedError: run ${runId} suspended on task ${taskId}`);
    this.name = "RunSuspendedError";
  }
}
