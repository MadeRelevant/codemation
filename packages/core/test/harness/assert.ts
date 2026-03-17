import assert from "node:assert/strict";
import type { Items, NodeActivationStats, RunResult } from "../../src/index.ts";

export function assertCompleted(result: RunResult): Extract<RunResult, { status: "completed" }> {
  assert.equal(result?.status, "completed", `Expected status=completed, got ${String((result as any)?.status)}`);
  return result as any;
}

export function assertPending(result: RunResult): Extract<RunResult, { status: "pending" }> {
  assert.equal(result?.status, "pending", `Expected status=pending, got ${String((result as any)?.status)}`);
  assert.ok((result as any).pending, "Expected pending details");
  return result as any;
}

export function assertFailed(result: RunResult, messageIncludes?: string): Extract<RunResult, { status: "failed" }> {
  assert.equal(result?.status, "failed", `Expected status=failed, got ${String((result as any)?.status)}`);
  assert.ok((result as any).error?.message, "Expected error.message");
  if (messageIncludes) assert.ok((result as any).error.message.includes(messageIncludes), `Expected error message to include: ${messageIncludes}`);
  return result as any;
}

export function jsonItem<TJson>(json: TJson, meta?: Readonly<Record<string, unknown>>): { json: TJson; meta?: Readonly<Record<string, unknown>> } {
  return meta ? { json, meta } : { json };
}

export function items<TJson>(list: Array<{ json: TJson } | TJson>): Items<TJson> {
  return list.map((v) => (v && typeof v === "object" && "json" in (v as any) ? (v as any) : ({ json: v } as any)));
}

export function activationOrder(activations: ReadonlyArray<NodeActivationStats>): string[] {
  return (activations ?? []).map((a) => a.nodeId);
}

