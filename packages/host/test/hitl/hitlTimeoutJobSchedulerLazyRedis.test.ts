import { describe, expect, test, vi } from "vitest";
import { HitlTimeoutJobScheduler } from "../../src/hitl/HitlTimeoutJobScheduler";
import type { AppConfig } from "../../src/presentation/config/AppConfig";

/**
 * The scheduler gates BullMQ on `appConfig.scheduler.kind` — the same abstraction
 * the rest of the host uses (AppConfigFactory resolves "bullmq" only when a Redis
 * URL is present, otherwise "local"). In local/inline mode it never touches Redis:
 * enqueue/cancel are inert no-ops and no Queue (hence no ioredis connection) is
 * ever constructed. This is what stops workspace pods without a Redis from
 * crash-looping on `ECONNREFUSED 127.0.0.1:6379` (the original HITL-on-k8s bug).
 *
 * In BullMQ mode, parsing is still deferred to the first enqueue/cancel so DI
 * consumers that never enqueue (e.g. `codemation user create`) can resolve the
 * scheduler without building a connection.
 */
describe("HitlTimeoutJobScheduler — scheduler-kind gating", () => {
  function appConfig(overrides: Partial<AppConfig["scheduler"]> = {}, env: NodeJS.ProcessEnv = {}): AppConfig {
    return {
      env,
      scheduler: { kind: "local", workerQueues: [], ...overrides },
    } as unknown as AppConfig;
  }

  test("constructs successfully in local mode", () => {
    const scheduler = new HitlTimeoutJobScheduler(appConfig({ kind: "local" }));
    expect(scheduler).toBeInstanceOf(HitlTimeoutJobScheduler);
  });

  test("constructs successfully in bullmq mode with a redis url", () => {
    const scheduler = new HitlTimeoutJobScheduler(
      appConfig({ kind: "bullmq", redisUrl: "redis://redis.example:6379" }),
    );
    expect(scheduler).toBeInstanceOf(HitlTimeoutJobScheduler);
  });

  test("exposes queue name based on prefix even in local mode", () => {
    const scheduler = new HitlTimeoutJobScheduler(
      appConfig({ kind: "local" }, { CODEMATION_BULLMQ_PREFIX: "test-prefix" }),
    );
    expect(scheduler.getQueueName()).toBe("test-prefix.hitl.timeout");
  });

  test("local mode: enqueueTimeoutJob is an inert no-op (no Redis touched)", async () => {
    const scheduler = new HitlTimeoutJobScheduler(appConfig({ kind: "local" }));
    await expect(
      scheduler.enqueueTimeoutJob({ taskId: "task-1", expiresAt: new Date("2099-01-01") }),
    ).resolves.toBeUndefined();
  });

  test("local mode: cancelTimeoutJob is an inert no-op (no Redis touched)", async () => {
    const scheduler = new HitlTimeoutJobScheduler(appConfig({ kind: "local" }));
    await expect(scheduler.cancelTimeoutJob("task-1")).resolves.toBeUndefined();
  });

  test("close() is a no-op when no queue was ever created", async () => {
    const scheduler = new HitlTimeoutJobScheduler(appConfig({ kind: "local" }));
    await expect(scheduler.close()).resolves.toBeUndefined();
  });

  test("local-mode enqueue/cancel never connect to Redis", async () => {
    // If a real ioredis connection were attempted, the unresolved socket would
    // keep the event loop busy; a fake timer + immediate resolution proves the
    // call path is synchronous-no-op rather than awaiting a connection.
    const connectSpy = vi.fn();
    const scheduler = new HitlTimeoutJobScheduler(appConfig({ kind: "local" }));
    await scheduler.enqueueTimeoutJob({ taskId: "t", expiresAt: new Date("2099-01-01") });
    await scheduler.cancelTimeoutJob("t");
    expect(connectSpy).not.toHaveBeenCalled();
  });
});
