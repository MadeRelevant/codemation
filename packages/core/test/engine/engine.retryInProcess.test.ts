import assert from "node:assert/strict";
import { test } from "vitest";

import { NoRetryPolicy, RetryPolicy } from "../../src/index.ts";

import { CallbackNodeConfig, chain, createEngineTestKit, items } from "../harness/index.ts";

test("engine applies in-process retries from node config before succeeding", async () => {
  let calls = 0;
  const flaky = new CallbackNodeConfig(
    "B",
    () => {
      calls += 1;
      if (calls < 2) throw new Error("transient");
    },
    { id: "B", retryPolicy: new RetryPolicy(3, 1) },
  );

  const A = new CallbackNodeConfig("A", () => {}, { id: "A" });
  const wf = chain({ id: "wf.retry.ok", name: "retry ok" }).start(A).then(flaky).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const r = await kit.runToCompletion({ wf, startAt: "A", items: items([{ x: 1 }]) });
  assert.equal(r.status, "completed");
  assert.equal(calls, 2);
});

test("engine surfaces failure after in-process retries are exhausted", async () => {
  let calls = 0;
  const alwaysFail = new CallbackNodeConfig(
    "B",
    () => {
      calls += 1;
      throw new Error("always");
    },
    { id: "B", retryPolicy: new RetryPolicy(2, 1) },
  );

  const A = new CallbackNodeConfig("A", () => {}, { id: "A" });
  const wf = chain({ id: "wf.retry.fail", name: "retry fail" }).start(A).then(alwaysFail).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const r = await kit.runToCompletion({ wf, startAt: "A", items: items([{ x: 1 }]) });
  assert.equal(r.status, "failed");
  assert.equal(calls, 2);
});

test("NoRetryPolicy does not retry failed execute", async () => {
  let calls = 0;
  const once = new CallbackNodeConfig(
    "B",
    () => {
      calls += 1;
      throw new Error("once");
    },
    { id: "B", retryPolicy: new NoRetryPolicy() },
  );

  const A = new CallbackNodeConfig("A", () => {}, { id: "A" });
  const wf = chain({ id: "wf.retry.none", name: "no retry" }).start(A).then(once).build();

  const kit = createEngineTestKit();
  await kit.start([wf]);

  const r = await kit.runToCompletion({ wf, startAt: "A", items: items([{ x: 1 }]) });
  assert.equal(r.status, "failed");
  assert.equal(calls, 1);
});
