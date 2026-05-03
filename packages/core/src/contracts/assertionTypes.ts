import type { JsonValue, NodeId } from "./workflowTypes";

/**
 * One assertion emitted by an assertion-emitting node (a node whose config sets
 * `emitsAssertions: true`). Each emitted item on `main` carries one of these as `item.json`.
 *
 * Pass/fail is derived from `score >= (passThreshold ?? 0.5)` — see {@link deriveAssertionPassed}.
 * The `errored` marker is for cases where the assertion code itself threw (distinct from
 * "the assertion was evaluated and the score was low") and is treated as a hard fail in rollups
 * regardless of `score`.
 */
export interface AssertionResult {
  readonly name: string;
  /** 0..1 score. Source of truth for pass/fail (compared against `passThreshold`). */
  readonly score: number;
  /** 0..1 threshold for "passed". When omitted, consumers default to 0.5. */
  readonly passThreshold?: number;
  /** True when evaluating the assertion threw — treated as fail regardless of `score`. */
  readonly errored?: true;
  /** What the assertion expected. Free-form JSON; UIs render with a JSON viewer. */
  readonly expected?: JsonValue;
  /** What the workflow actually produced. */
  readonly actual?: JsonValue;
  /** Short human-readable explanation, especially for fails / errors. */
  readonly message?: string;
  /** Bag of supplemental fields (e.g. judge prompt, judge raw response, comparison method). */
  readonly details?: Readonly<Record<string, JsonValue>>;
}

/**
 * Default {@link AssertionResult.passThreshold} when authors omit it. Boolean-style assertions
 * (assertEqual / contains / etc.) emit `score: 1` or `score: 0` so this default works for them;
 * AI-judge assertions are expected to set their own threshold.
 */
export const DEFAULT_ASSERTION_PASS_THRESHOLD = 0.5;

/**
 * Derive whether an assertion result is considered "passing" using the score-based contract:
 * `errored` always fails, otherwise `score >= (passThreshold ?? 0.5)`. This is the canonical
 * derivation — UI and rollup code should call it rather than inlining the comparison so future
 * tweaks (e.g. NaN handling) land in one place.
 */
export function deriveAssertionPassed(result: {
  readonly score: number;
  readonly passThreshold?: number;
  readonly errored?: true;
}): boolean {
  if (result.errored === true) return false;
  const threshold = result.passThreshold ?? DEFAULT_ASSERTION_PASS_THRESHOLD;
  return result.score >= threshold;
}

/**
 * Provenance for a persisted {@link AssertionResult}: which node produced it and where in the
 * per-item iteration tree it landed. Filled in by the host-side persister, not the node itself.
 */
export interface AssertionResultProvenance {
  readonly nodeId: NodeId;
  /** Per-item iteration id when the emitting node ran inside a per-item loop. */
  readonly iterationId?: string;
  /** Item index (0-based) within the activation that produced this assertion. */
  readonly itemIndex?: number;
}
