/**
 * Covers simple contract value types and NoOp stubs that only need an import
 * or a constructor call to be measured.
 */
import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { AgentBindError } from "../../src/contracts/AgentBindError";
import { NoRetryPolicy } from "../../src/contracts/NoRetryPolicy";
import { ExpRetryPolicy } from "../../src/contracts/ExpRetryPolicy";

describe("AgentBindError", () => {
  test("sets name to AgentBindError and preserves message", () => {
    const err = new AgentBindError("test message");
    assert.equal(err.name, "AgentBindError");
    assert.equal(err.message, "test message");
    assert.ok(err instanceof Error);
  });
});

describe("NoRetryPolicy", () => {
  test("kind is none", () => {
    const policy = new NoRetryPolicy();
    assert.equal(policy.kind, "none");
  });
});

describe("ExpRetryPolicy", () => {
  test("constructs with valid parameters", () => {
    const policy = new ExpRetryPolicy(3, 100, 2);
    assert.equal(policy.kind, "exponential");
    assert.equal(policy.maxAttempts, 3);
    assert.equal(policy.initialDelayMs, 100);
    assert.equal(policy.multiplier, 2);
  });

  test("throws when maxAttempts is not a positive integer", () => {
    assert.throws(() => new ExpRetryPolicy(0, 100, 2), /maxAttempts/);
    assert.throws(() => new ExpRetryPolicy(-1, 100, 2), /maxAttempts/);
    assert.throws(() => new ExpRetryPolicy(1.5, 100, 2), /maxAttempts/);
  });

  test("throws when initialDelayMs is negative", () => {
    assert.throws(() => new ExpRetryPolicy(1, -1, 2), /initialDelayMs/);
  });

  test("throws when multiplier is less than 1", () => {
    assert.throws(() => new ExpRetryPolicy(1, 100, 0.5), /multiplier/);
  });

  test("accepts maxDelayMs and jitter", () => {
    const policy = new ExpRetryPolicy(5, 50, 1.5, 10000, true);
    assert.equal(policy.maxDelayMs, 10000);
    assert.equal(policy.jitter, true);
  });
});
