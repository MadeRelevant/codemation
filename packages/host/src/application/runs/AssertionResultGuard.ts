import { injectable, type AssertionResult } from "@codemation/core";

/**
 * Type-guard for whether an arbitrary value emitted on a node's `main` port matches the
 * {@link AssertionResult} contract. Used by the assertion persister to filter junk: a node
 * with `emitsAssertions: true` is *expected* to emit AssertionResults, but if a bug or a
 * misconfigured generic node emits something else, we skip rather than crash.
 *
 * The contract is score-based: `score: number` (0..1) is required; `passThreshold` and `errored`
 * are optional. We don't enforce the 0..1 range here — out-of-range scores are still persisted
 * so the UI can flag them rather than silently dropping rows.
 */
@injectable()
export class AssertionResultGuard {
  isAssertionResult(value: unknown): value is AssertionResult {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<AssertionResult>;
    if (typeof candidate.name !== "string") return false;
    if (typeof candidate.score !== "number" || Number.isNaN(candidate.score)) return false;
    if (
      candidate.passThreshold !== undefined &&
      (typeof candidate.passThreshold !== "number" || Number.isNaN(candidate.passThreshold))
    ) {
      return false;
    }
    if (candidate.errored !== undefined && candidate.errored !== true) return false;
    return true;
  }
}
