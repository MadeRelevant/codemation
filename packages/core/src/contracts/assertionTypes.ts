import type { JsonValue, NodeId } from "./workflowTypes";

/**
 * Status of a single assertion produced by an assertion-emitting node.
 *
 * - `pass`: the assertion held.
 * - `fail`: the assertion did not hold (expected/actual mismatch, predicate returned false, etc.).
 * - `error`: evaluating the assertion itself threw — distinct from `fail` so dashboards can
 *   separate "the workflow output was wrong" from "the assertion code is broken."
 */
export type AssertionStatus = "pass" | "fail" | "error";

/**
 * One assertion emitted by an assertion-emitting node (a node whose config sets
 * `emitsAssertions: true`). Each emitted item on `main` carries one of these as `item.json`.
 *
 * Shape is stable — host persisters and chart UIs rely on `name`, `status`, `score`, and the
 * `expected`/`actual` pair. `details` is free-form metadata for debugging.
 */
export interface AssertionResult {
  readonly name: string;
  readonly status: AssertionStatus;
  /**
   * Optional scalar (typically 0..1) for charts and judge-by-agent scoring. Pass/fail charts
   * use the `status` field; numeric/quality charts use `score`. Both can be present.
   */
  readonly score?: number;
  /** What the assertion expected. Free-form JSON; UIs render with a JSON viewer. */
  readonly expected?: JsonValue;
  /** What the workflow actually produced. */
  readonly actual?: JsonValue;
  /** Short human-readable explanation, especially for `fail` and `error`. */
  readonly message?: string;
  /** Bag of supplemental fields (e.g. judge prompt, judge raw response, comparison method). */
  readonly details?: Readonly<Record<string, JsonValue>>;
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
