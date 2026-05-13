import type { NodeId } from "../../types";

/**
 * Unique ids for persisted connection invocation history rows (LLM/tool calls under an owning node).
 *
 * Uses Web Crypto's `randomUUID` so this module is safe in browser-bundle contexts —
 * paired with `NodeIterationIdFactory` which had the same `node:crypto` regression.
 */
export class ConnectionInvocationIdFactory {
  static create(): string {
    return `cinv_${globalThis.crypto.randomUUID()}`;
  }

  /** Deterministic id for tests when a stable sequence is needed. */
  static createForTest(runId: string, connectionNodeId: NodeId, sequence: number): string {
    return `cinv_${runId}_${connectionNodeId}_${sequence}`;
  }
}
