/**
 * Tests for DefinedNodeRegistry and DefinedCollectionRegistry —
 * both use static maps; register/resolve/list paths.
 */
import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { DefinedNodeRegistry } from "../../src/authoring/DefinedNodeRegistry";
import { DefinedCollectionRegistry } from "../../src/authoring/DefinedCollectionRegistry";

describe("DefinedNodeRegistry", () => {
  test("register and resolve a definition by key", () => {
    const def = { key: "test-node-def", nodeConfig: {}, outputConfig: {} } as never;
    DefinedNodeRegistry.register(def);
    const resolved = DefinedNodeRegistry.resolve("test-node-def");
    assert.equal(resolved, def);
  });

  test("resolve returns undefined for unknown key", () => {
    const resolved = DefinedNodeRegistry.resolve("completely-unknown-key-xyz");
    assert.equal(resolved, undefined);
  });
});

describe("DefinedCollectionRegistry", () => {
  test("register and resolve a collection definition", () => {
    const def = { name: "test-collection-abc" } as never;
    DefinedCollectionRegistry.register(def);
    const resolved = DefinedCollectionRegistry.resolve("test-collection-abc");
    assert.equal(resolved, def);
  });

  test("resolve returns undefined for unknown name", () => {
    const resolved = DefinedCollectionRegistry.resolve("no-such-collection-xyz");
    assert.equal(resolved, undefined);
  });

  test("list returns registered definitions", () => {
    const def = { name: "list-test-collection-xyz" } as never;
    DefinedCollectionRegistry.register(def);
    const listed = DefinedCollectionRegistry.list();
    assert.ok(listed.some((d) => d.name === "list-test-collection-xyz"));
  });
});
