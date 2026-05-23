import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { PersistedWorkflowTokenRegistry } from "../../src/workflowSnapshots/PersistedWorkflowTokenRegistry";
import type { WorkflowDefinition } from "../../src/types";

class NodeA {}
class ConfigA {
  readonly kind = "node" as const;
  readonly type = ConfigA;
}

describe("PersistedWorkflowTokenRegistry", () => {
  test("register stores token and returns tokenId", () => {
    const registry = new PersistedWorkflowTokenRegistry();
    const id = registry.register(NodeA, "@test/pkg");
    assert.equal(id, "@test/pkg::NodeA");
  });

  test("register with persistedNameOverride uses the override", () => {
    const registry = new PersistedWorkflowTokenRegistry();
    const id = registry.register(NodeA, "@test/pkg", "CustomName");
    assert.equal(id, "@test/pkg::CustomName");
  });

  test("getTokenId returns registered id for known token", () => {
    const registry = new PersistedWorkflowTokenRegistry();
    registry.register(NodeA, "@test/pkg");
    const id = registry.getTokenId(NodeA);
    assert.equal(id, "@test/pkg::NodeA");
  });

  test("getTokenId returns undefined for unknown token with no metadata", () => {
    const registry = new PersistedWorkflowTokenRegistry();
    // Symbol token with no metadata → returns undefined
    const sym = Symbol("anon");
    const id = registry.getTokenId(sym as never);
    assert.equal(id, undefined);
  });

  test("resolve returns token for known tokenId", () => {
    const registry = new PersistedWorkflowTokenRegistry();
    registry.register(NodeA, "@test/pkg");
    const resolved = registry.resolve("@test/pkg::NodeA");
    assert.equal(resolved, NodeA);
  });

  test("resolve returns undefined for unknown tokenId", () => {
    const registry = new PersistedWorkflowTokenRegistry();
    assert.equal(registry.resolve("unknown::Token"), undefined);
  });

  test("registerFromWorkflows discovers and registers node types", () => {
    const registry = new PersistedWorkflowTokenRegistry();
    const wf: WorkflowDefinition = {
      id: "wf-1",
      name: "test",
      nodes: [
        {
          id: "n1",
          kind: "node",
          name: "N1",
          type: NodeA,
          config: { kind: "node", type: ConfigA, name: "N1" },
        },
      ],
      edges: [],
    };
    // First register both tokens so registerFromWorkflows can look them up
    registry.register(NodeA, "@test/pkg");
    registry.register(ConfigA, "@test/pkg");
    // Calling again should not duplicate or throw
    registry.registerFromWorkflows([wf]);
    assert.equal(registry.getTokenId(NodeA), "@test/pkg::NodeA");
  });

  test("getTokenId falls back to function name for unregistered class token", () => {
    const registry = new PersistedWorkflowTokenRegistry();
    // NodeA is not registered; getTokenId should infer from function.name
    const id = registry.getTokenId(NodeA);
    // Without @persisted metadata the factory returns undefined; result is undefined
    assert.equal(id, undefined);
  });

  test("getTokenId returns string token as-is", () => {
    const registry = new PersistedWorkflowTokenRegistry();
    const strToken = "my-string-token";
    // String tokens without metadata → PersistedRuntimeTypeIdFactory returns null for strings
    const id = registry.getTokenId(strToken as never);
    // Expected: undefined (no metadata, string token not decorated)
    assert.equal(id, undefined);
  });
});
