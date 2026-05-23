import assert from "node:assert/strict";
import { test } from "vitest";

import type { AsyncSleeper } from "../../src/execution/asyncSleeper.types";
import { InProcessRetryRunner } from "../../src/execution/InProcessRetryRunner";

class NoOpSleeper implements AsyncSleeper {
  sleep(_ms: number): Promise<void> {
    return Promise.resolve();
  }
}

test("InProcessRetryRunner clamps maxAttempts > 10 to 10 and emits warning", async () => {
  const sleeper = new NoOpSleeper();
  const runner = new InProcessRetryRunner(sleeper);

  const warnings: string[] = [];
  const warn = (msg: string) => warnings.push(msg);

  let attempts = 0;
  await assert.rejects(
    () =>
      runner.run(
        { kind: "fixed", maxAttempts: 1_000_000, delayMs: 0 },
        async () => {
          attempts++;
          throw new Error("always fails");
        },
        undefined,
        warn,
      ),
    /always fails/,
  );

  assert.equal(attempts, 10, "attempts must be clamped to the hard ceiling of 10");
  assert.equal(warnings.length, 1, "exactly one warning must be emitted");
  assert.match(warnings[0]!, /1000000/, "warning must mention the original value");
  assert.match(warnings[0]!, /10/, "warning must mention the ceiling");
});

test("InProcessRetryRunner does not warn when maxAttempts <= 10", async () => {
  const sleeper = new NoOpSleeper();
  const runner = new InProcessRetryRunner(sleeper);

  const warnings: string[] = [];
  const warn = (msg: string) => warnings.push(msg);

  let attempts = 0;
  await assert.rejects(
    () =>
      runner.run(
        { kind: "fixed", maxAttempts: 10, delayMs: 0 },
        async () => {
          attempts++;
          throw new Error("fail");
        },
        undefined,
        warn,
      ),
    /fail/,
  );

  assert.equal(attempts, 10);
  assert.equal(warnings.length, 0, "no warning when maxAttempts is exactly at the ceiling");
});

test("InProcessRetryRunner clamps exponential maxAttempts > 10 to 10 with warning", async () => {
  const sleeper = new NoOpSleeper();
  const runner = new InProcessRetryRunner(sleeper);

  const warnings: string[] = [];
  let attempts = 0;

  await assert.rejects(
    () =>
      runner.run(
        { kind: "exponential", maxAttempts: 500, initialDelayMs: 0, multiplier: 1 },
        async () => {
          attempts++;
          throw new Error("fail");
        },
        undefined,
        (msg) => warnings.push(msg),
      ),
    /fail/,
  );

  assert.equal(attempts, 10);
  assert.equal(warnings.length, 1);
});
