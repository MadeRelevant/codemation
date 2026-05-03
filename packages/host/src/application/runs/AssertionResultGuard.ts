import { injectable, type AssertionResult, type AssertionStatus } from "@codemation/core";

const ASSERTION_STATUSES: ReadonlyArray<AssertionStatus> = ["pass", "fail", "error"];

/**
 * Type-guard for whether an arbitrary value emitted on a node's `main` port matches the
 * {@link AssertionResult} contract. Used by the assertion persister to filter junk: a node
 * with `emitsAssertions: true` is *expected* to emit AssertionResults, but if a bug or a
 * misconfigured generic node emits something else, we skip rather than crash.
 */
@injectable()
export class AssertionResultGuard {
  isAssertionResult(value: unknown): value is AssertionResult {
    if (typeof value !== "object" || value === null) return false;
    const candidate = value as Partial<AssertionResult>;
    return (
      typeof candidate.name === "string" &&
      typeof candidate.status === "string" &&
      ASSERTION_STATUSES.includes(candidate.status as AssertionStatus)
    );
  }
}
