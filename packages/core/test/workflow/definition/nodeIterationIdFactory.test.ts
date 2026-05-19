import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { NodeIterationIdFactory } from "../../../src/workflow/definition/NodeIterationIdFactory";
import { ConnectionInvocationIdFactory } from "../../../src/workflow/definition/ConnectionInvocationIdFactory";

describe("NodeIterationIdFactory", () => {
  test("create returns a string starting with iter_", () => {
    const id = NodeIterationIdFactory.create();
    assert.ok(typeof id === "string");
    assert.ok(id.startsWith("iter_"));
  });

  test("createForTest returns deterministic id from seed + sequence", () => {
    const id = NodeIterationIdFactory.createForTest("seed", 3);
    assert.equal(id, "iter_seed_3");
  });

  test("createForConnection returns deterministic id from connectionNodeId + sequence", () => {
    const id = NodeIterationIdFactory.createForConnection("node__conn__llm", 2);
    assert.equal(id, "iter_node__conn__llm_2");
  });

  test("create produces unique ids on successive calls", () => {
    const ids = new Set(Array.from({ length: 10 }, () => NodeIterationIdFactory.create()));
    assert.equal(ids.size, 10);
  });
});

describe("ConnectionInvocationIdFactory", () => {
  test("create returns a string starting with cinv_", () => {
    const id = ConnectionInvocationIdFactory.create();
    assert.ok(typeof id === "string");
    assert.ok(id.startsWith("cinv_"));
  });

  test("createForTest returns deterministic id", () => {
    const id = ConnectionInvocationIdFactory.createForTest("run-1", "node__conn__llm", 7);
    assert.equal(id, "cinv_run-1_node__conn__llm_7");
  });

  test("create produces unique ids", () => {
    const ids = new Set(Array.from({ length: 5 }, () => ConnectionInvocationIdFactory.create()));
    assert.equal(ids.size, 5);
  });
});
