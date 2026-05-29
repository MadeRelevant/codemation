import { describe, expect, test } from "vitest";
import { HitlTimeoutJobScheduler } from "../../src/hitl/HitlTimeoutJobScheduler";
import type { AppConfig } from "../../src/presentation/config/AppConfig";

/**
 * Constructor no longer parses REDIS_URL up-front — parsing is deferred to the
 * first enqueue/cancel call. This lets DI consumers that never enqueue
 * (e.g. `codemation user create`, which the browser-coverage harness invokes
 * with REDIS_URL="" set explicitly) resolve this scheduler without throwing.
 *
 * Regression: HITL sprint added eager `RedisConnectionOptionsFactory.fromConfig`
 * in the constructor, which threw "Invalid URL" with input '' on the browser
 * coverage job because the engine bootstrap resolves HitlTimeoutJobScheduler
 * via the workflow runtime DI graph even on user-create paths.
 */
describe("HitlTimeoutJobScheduler — lazy REDIS_URL parsing", () => {
  function appConfig(env: NodeJS.ProcessEnv): AppConfig {
    return { env } as unknown as AppConfig;
  }

  test("constructs successfully with REDIS_URL empty string", () => {
    const scheduler = new HitlTimeoutJobScheduler(appConfig({ REDIS_URL: "" }));
    expect(scheduler).toBeInstanceOf(HitlTimeoutJobScheduler);
  });

  test("constructs successfully with REDIS_URL absent", () => {
    const scheduler = new HitlTimeoutJobScheduler(appConfig({}));
    expect(scheduler).toBeInstanceOf(HitlTimeoutJobScheduler);
  });

  test("exposes queue name based on prefix even without Redis", () => {
    const scheduler = new HitlTimeoutJobScheduler(
      appConfig({ REDIS_URL: "", CODEMATION_BULLMQ_PREFIX: "test-prefix" }),
    );
    expect(scheduler.getQueueName()).toBe("test-prefix.hitl.timeout");
  });

  test("close() is a no-op when no queue was ever created", async () => {
    const scheduler = new HitlTimeoutJobScheduler(appConfig({ REDIS_URL: "" }));
    await expect(scheduler.close()).resolves.toBeUndefined();
  });
});
