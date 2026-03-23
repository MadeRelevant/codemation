import assert from "node:assert/strict";
import { test } from "vitest";

import { ExpRetryPolicy } from "../src/contracts/ExpRetryPolicy";
import { RetryPolicy } from "../src/contracts/RetryPolicy";
import type { FixedRetryPolicySpec } from "../src/contracts/retryPolicySpec.types";
import type { AsyncSleeper } from "../src/engine/execution/asyncSleeper.types";
import { InProcessRetryRunner } from "../src/engine/execution/InProcessRetryRunner";

class RecordingAsyncSleeper implements AsyncSleeper {
  readonly sleeps: number[] = [];

  sleep(ms: number): Promise<void> {
    this.sleeps.push(ms);
    return Promise.resolve();
  }
}

test("InProcessRetryRunner runs work once when policy is undefined", async () => {
  const sleeper = new RecordingAsyncSleeper();
  const runner = new InProcessRetryRunner(sleeper);
  let calls = 0;
  const result = await runner.run(undefined, async () => {
    calls++;
    return 42;
  });
  assert.equal(result, 42);
  assert.equal(calls, 1);
  assert.deepEqual(sleeper.sleeps, []);
});

test("InProcessRetryRunner retries fixed delay then succeeds", async () => {
  const sleeper = new RecordingAsyncSleeper();
  const runner = new InProcessRetryRunner(sleeper);
  let calls = 0;
  const result = await runner.run(new RetryPolicy(3, 50), async () => {
    calls++;
    if (calls < 3) throw new Error("fail");
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(calls, 3);
  assert.deepEqual(sleeper.sleeps, [50, 50]);
});

test("InProcessRetryRunner throws last error after exhausting fixed attempts", async () => {
  const sleeper = new RecordingAsyncSleeper();
  const runner = new InProcessRetryRunner(sleeper);
  let calls = 0;
  await assert.rejects(
    () =>
      runner.run(new RetryPolicy(2, 10), async () => {
        calls++;
        throw new Error(`e${calls}`);
      }),
    (e: unknown) => e instanceof Error && e.message === "e2",
  );
  assert.equal(calls, 2);
  assert.deepEqual(sleeper.sleeps, [10]);
});

test("InProcessRetryRunner exponential backoff delays without jitter", async () => {
  const sleeper = new RecordingAsyncSleeper();
  const runner = new InProcessRetryRunner(sleeper);
  let calls = 0;
  await runner.run(new ExpRetryPolicy(3, 100, 2, undefined, false), async () => {
    calls++;
    if (calls < 3) throw new Error("fail");
    return 1;
  });
  assert.deepEqual(sleeper.sleeps, [100, 200]);
});

test("NoRetryPolicy / kind none performs a single attempt", async () => {
  const sleeper = new RecordingAsyncSleeper();
  const runner = new InProcessRetryRunner(sleeper);
  let calls = 0;
  await assert.rejects(() =>
    runner.run({ kind: "none" }, async () => {
      calls++;
      throw new Error("once");
    }),
  );
  assert.equal(calls, 1);
  assert.deepEqual(sleeper.sleeps, []);
});

test("InProcessRetryRunner rejects invalid fixed policy from plain data", async () => {
  const runner = new InProcessRetryRunner(new RecordingAsyncSleeper());
  const bad: FixedRetryPolicySpec = { kind: "fixed", maxAttempts: 0, delayMs: 1 };
  await assert.rejects(() => runner.run(bad, async () => 1));
});

test("RetryPolicy and ExpRetryPolicy constructors validate inputs", () => {
  assert.throws(() => new RetryPolicy(0, 1));
  assert.throws(() => new RetryPolicy(1, -1));
  assert.throws(() => new ExpRetryPolicy(1, -1, 2));
  assert.throws(() => new ExpRetryPolicy(1, 1, 0.5));
});

test("InProcessRetryRunner exponential with jitter still completes", async () => {
  const sleeper = new RecordingAsyncSleeper();
  const runner = new InProcessRetryRunner(sleeper);
  let calls = 0;
  await runner.run(new ExpRetryPolicy(2, 10, 2, 500, true), async () => {
    calls++;
    if (calls < 2) throw new Error("fail");
    return 1;
  });
  assert.equal(calls, 2);
  assert.equal(sleeper.sleeps.length, 1);
});
