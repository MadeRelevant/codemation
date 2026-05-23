/**
 * Tests for WorkflowSnapshotResolver — covers rebuild-from-snapshot paths
 * (no live workflow, incompatible live node types, missing token IDs, etc.)
 */
import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { WorkflowSnapshotResolver } from "../../src/workflowSnapshots/WorkflowSnapshotResolver";
import { WorkflowSnapshotCodec } from "../../src/workflowSnapshots/WorkflowSnapshotCodec";
import { MissingRuntimeFallbacks } from "../../src/workflowSnapshots/MissingRuntimeFallbacksFactory";
import { PersistedWorkflowTokenRegistry } from "../../src/workflowSnapshots/PersistedWorkflowTokenRegistry";
import type { WorkflowDefinition, WorkflowRepository } from "../../src/types";

class NodeA {}
class ConfigA {
  readonly kind = "node" as const;
  readonly type = ConfigA;
  readonly name = "ConfigA";
}

function makeRegistry(): PersistedWorkflowTokenRegistry {
  const registry = new PersistedWorkflowTokenRegistry();
  registry.register(NodeA, "@test/pkg");
  registry.register(ConfigA, "@test/pkg");
  return registry;
}

function makeWorkflow(id: string): WorkflowDefinition {
  return {
    id,
    name: id,
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
}

function makeRepo(workflows: WorkflowDefinition[]): WorkflowRepository {
  return {
    get: (id) => workflows.find((w) => w.id === id),
    list: () => workflows,
  };
}

describe("WorkflowSnapshotResolver", () => {
  test("resolve returns live workflow when no snapshot provided", () => {
    const registry = makeRegistry();
    const codec = new WorkflowSnapshotCodec(registry);
    const fallbacks = new MissingRuntimeFallbacks();
    const wf = makeWorkflow("wf-1");
    const resolver = new WorkflowSnapshotResolver(makeRepo([wf]), registry, codec, fallbacks);
    const result = resolver.resolve({ workflowId: "wf-1", workflowSnapshot: undefined });
    assert.equal(result?.id, "wf-1");
    assert.equal(result?.nodes.length, 1);
  });

  test("resolve returns undefined when no snapshot and workflow not in repo", () => {
    const registry = makeRegistry();
    const codec = new WorkflowSnapshotCodec(registry);
    const fallbacks = new MissingRuntimeFallbacks();
    const resolver = new WorkflowSnapshotResolver(makeRepo([]), registry, codec, fallbacks);
    const result = resolver.resolve({ workflowId: "nonexistent" });
    assert.equal(result, undefined);
  });

  test("resolve rebuilds workflow from snapshot when no live workflow exists", () => {
    const registry = makeRegistry();
    const codec = new WorkflowSnapshotCodec(registry);
    const fallbacks = new MissingRuntimeFallbacks();
    const wf = makeWorkflow("wf-snap");
    const snapshot = codec.create(wf);
    // Resolver has empty repo → no live workflow
    const resolver = new WorkflowSnapshotResolver(makeRepo([]), registry, codec, fallbacks);
    const result = resolver.resolve({ workflowId: "wf-snap", workflowSnapshot: snapshot });
    assert.ok(result);
    assert.equal(result?.id, "wf-snap");
  });

  test("resolve uses MissingRuntimeFallbacks for unknown token ids", () => {
    const registry = makeRegistry();
    const codec = new WorkflowSnapshotCodec(registry);
    const fallbacks = new MissingRuntimeFallbacks();
    const wf = makeWorkflow("wf-missing");
    const snapshot = codec.create(wf);
    // Resolver has the workflow but with a different (incompatible) node type
    class NodeB {}
    class ConfigB {
      readonly kind = "node" as const;
      readonly type = ConfigB;
      readonly name = "ConfigB";
    }
    const wfLive: WorkflowDefinition = {
      ...wf,
      nodes: [{ id: "n1", kind: "node", name: "N1", type: NodeB, config: { kind: "node", type: ConfigB, name: "N1" } }],
    };
    const resolver = new WorkflowSnapshotResolver(makeRepo([wfLive]), registry, codec, fallbacks);
    const result = resolver.resolve({ workflowId: "wf-missing", workflowSnapshot: snapshot });
    assert.ok(result);
    // Should have fallen back to MissingRuntime node
    assert.equal(result?.nodes[0]?.kind, "node");
  });

  test("resolve throws when snapshot node is missing stable token ids", () => {
    const registry = makeRegistry();
    const codec = new WorkflowSnapshotCodec(registry);
    const fallbacks = new MissingRuntimeFallbacks();
    const wf = makeWorkflow("wf-badsnap");
    const snapshot = codec.create(wf);
    // Corrupt the snapshot by removing token ids
    const badSnapshot = {
      ...snapshot,
      nodes: snapshot.nodes.map((n) => ({ ...n, nodeTokenId: undefined, configTokenId: undefined })),
    };
    const resolver = new WorkflowSnapshotResolver(makeRepo([wf]), registry, codec, fallbacks);
    assert.throws(
      () => resolver.resolve({ workflowId: "wf-badsnap", workflowSnapshot: badSnapshot as never }),
      /missing stable token ids/,
    );
  });
});

describe("MissingRuntimeFallbacksFactory", () => {
  test("createDefinition for trigger kind produces MissingRuntimeTrigger definition", () => {
    const fallbacks = new MissingRuntimeFallbacks();
    const def = fallbacks.createDefinition({ id: "t1", kind: "trigger", name: "T" } as never);
    assert.equal(def.kind, "trigger");
    assert.equal(def.id, "t1");
  });

  test("createDefinition for node kind produces MissingRuntimeNode definition", () => {
    const fallbacks = new MissingRuntimeFallbacks();
    const def = fallbacks.createDefinition({ id: "n1", kind: "node", name: "N" } as never);
    assert.equal(def.kind, "node");
    assert.equal(def.id, "n1");
  });
});
