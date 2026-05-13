import type { NodeId } from "../../types";

/**
 * Unique ids for one per-item iteration of a runnable node's execute loop.
 *
 * Activations are per-batch (one scheduled execution of a node, possibly with N items).
 * Iterations refine that to one identifier per item-index inside the batch loop, so per-item
 * connection invocations and telemetry can be grouped without time-window heuristics.
 *
 * Uses Web Crypto's `randomUUID` (Node 19+ and all modern browsers) so this module is safe
 * to include in the browser entry. Importing `node:crypto` here previously leaked into the
 * canvas client bundle through `browser.ts` and OOM'd consumers' Turbopack builds.
 */
export class NodeIterationIdFactory {
  static create(): string {
    return `iter_${globalThis.crypto.randomUUID()}`;
  }

  /** Deterministic id for tests when a stable sequence is needed. */
  static createForTest(seed: string, sequence: number): string {
    return `iter_${seed}_${sequence}`;
  }

  /** Deterministic id derived from a connection node id (for sub-agent / tool-call scopes). */
  static createForConnection(connectionNodeId: NodeId, sequence: number): string {
    return `iter_${connectionNodeId}_${sequence}`;
  }
}
