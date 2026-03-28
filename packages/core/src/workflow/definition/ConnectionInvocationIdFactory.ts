import { randomUUID } from "node:crypto";

import type { NodeId } from "../../types";

/**
 * Unique ids for persisted connection invocation history rows (LLM/tool calls under an owning node).
 */
export class ConnectionInvocationIdFactory {
  static create(): string {
    return `cinv_${randomUUID()}`;
  }

  /** Deterministic id for tests when a stable sequence is needed. */
  static createForTest(runId: string, connectionNodeId: NodeId, sequence: number): string {
    return `cinv_${runId}_${connectionNodeId}_${sequence}`;
  }
}
