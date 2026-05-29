// @vitest-environment node

/**
 * Unit tests for HitlTimeoutWorker guard branches.
 *
 * The happy paths (auto-accept + halt span emission) are covered by
 * HitlTelemetrySpans.test.ts. This file covers the remaining guards:
 *  - constructor throws when no HumanTaskStore is registered
 *  - processTimeoutForTask is a no-op when the task is not found
 *  - processTimeoutForTask is a no-op when the task is no longer pending
 *
 * Hand-built stubs (no DI / Redis / BullMQ), per HitlTelemetrySpans.test.ts.
 */

import { describe, expect, it, vi } from "vitest";
import type { HumanTaskRecord } from "@codemation/core";
import { HitlTimeoutWorker } from "../../src/hitl/HitlTimeoutWorker";

function makeTask(overrides: Partial<HumanTaskRecord> = {}): HumanTaskRecord {
  return {
    id: "task-1",
    runId: "run-1",
    workflowId: "wf-1",
    nodeId: "approval",
    activationId: "act-1",
    itemIndex: 0,
    status: "pending",
    channel: "inbox",
    subject: { title: "Approve", summary: "" },
    metadata: {},
    decisionSchemaJson: "{}",
    decisionSchemaHash: "abc",
    onTimeout: "halt",
    resumeTokenHash: "tok",
    expiresAt: new Date("2099-01-01"),
    createdAt: new Date(),
    deliveryRef: null,
    ...overrides,
  };
}

const APP_CONFIG = {
  env: { REDIS_URL: "redis://127.0.0.1:6379", AUTH_SECRET: "test" },
};

function makeWorker(opts: { task?: HumanTaskRecord | undefined; storeUndefined?: boolean } = {}): {
  worker: HitlTimeoutWorker;
  store:
    | {
        findById: ReturnType<typeof vi.fn>;
        markTimedOut: ReturnType<typeof vi.fn>;
        markAutoAccepted: ReturnType<typeof vi.fn>;
      }
    | undefined;
  engine: { resumeRun: ReturnType<typeof vi.fn> };
} {
  const store = opts.storeUndefined
    ? undefined
    : {
        findById: vi.fn(async () => opts.task),
        markTimedOut: vi.fn(async () => {}),
        markAutoAccepted: vi.fn(async () => {}),
      };
  const engine = { resumeRun: vi.fn(async () => ({ status: "running" as const })) };
  const scheduler = { getQueueName: vi.fn(() => "test.hitl.timeout") };
  const resumeTelemetry = { forTask: vi.fn(async () => ({ addSpanEvent: vi.fn() })) };

  const worker = new HitlTimeoutWorker(
    store as never,
    engine as never,
    scheduler as never,
    APP_CONFIG as never,
    resumeTelemetry as never,
  );
  return { worker, store, engine };
}

describe("HitlTimeoutWorker guards", () => {
  it("throws at construction when no HumanTaskStore is registered", () => {
    expect(() => makeWorker({ storeUndefined: true })).toThrow("HumanTaskStore is not registered");
  });

  it("is a no-op when the task does not exist", async () => {
    const { worker, store, engine } = makeWorker({ task: undefined });
    await worker.processTimeoutForTask("task-1");
    expect(store!.markTimedOut).not.toHaveBeenCalled();
    expect(store!.markAutoAccepted).not.toHaveBeenCalled();
    expect(engine.resumeRun).not.toHaveBeenCalled();
  });

  it("is a no-op when the task is no longer pending", async () => {
    const { worker, store, engine } = makeWorker({ task: makeTask({ status: "decided" }) });
    await worker.processTimeoutForTask("task-1");
    expect(store!.markTimedOut).not.toHaveBeenCalled();
    expect(store!.markAutoAccepted).not.toHaveBeenCalled();
    expect(engine.resumeRun).not.toHaveBeenCalled();
  });
});
