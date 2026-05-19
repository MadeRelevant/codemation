import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { WorkflowStoragePolicyEvaluator } from "../../src/policies/storage/WorkflowStoragePolicyEvaluator";
import { RunTerminalPersistenceCoordinator } from "../../src/policies/storage/RunTerminalPersistenceCoordinator";
import type { WorkflowDefinition, NodeResolver, PersistedRunPolicySnapshot } from "../../src/types";

// Minimal workflow definition helper
function makeWorkflow(id = "wf-1", storagePolicy?: unknown): WorkflowDefinition {
  return {
    id,
    name: "test",
    nodes: [],
    edges: [],
    storagePolicy: storagePolicy as WorkflowDefinition["storagePolicy"],
  };
}

// Minimal NodeResolver that returns a resolver by token
function makeNodeResolver(impl?: { shouldPersist: (args: unknown) => Promise<boolean> }): NodeResolver {
  return {
    resolve: () => impl as never,
    isRegistered: () => true,
  } as unknown as NodeResolver;
}

describe("WorkflowStoragePolicyEvaluator", () => {
  const args = {
    runId: "run-1",
    workflowId: "wf-1",
    workflow: makeWorkflow(),
    finalStatus: "completed" as const,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };

  test("no storagePolicy on workflow → falls back to snapshot policy ALL → persists", async () => {
    const evaluator = new WorkflowStoragePolicyEvaluator(makeNodeResolver());
    const snapshot: PersistedRunPolicySnapshot = { storagePolicy: "ALL" };
    assert.equal(await evaluator.shouldPersist(makeWorkflow(), snapshot, args), true);
  });

  test("no storagePolicy, no snapshot → defaults ALL → persists", async () => {
    const evaluator = new WorkflowStoragePolicyEvaluator(makeNodeResolver());
    assert.equal(await evaluator.shouldPersist(makeWorkflow(), undefined, args), true);
  });

  test("storagePolicy NEVER → does not persist", async () => {
    const evaluator = new WorkflowStoragePolicyEvaluator(makeNodeResolver());
    assert.equal(await evaluator.shouldPersist(makeWorkflow("wf-1", "NEVER"), undefined, args), false);
  });

  test("storagePolicy SUCCESS → persists when completed", async () => {
    const evaluator = new WorkflowStoragePolicyEvaluator(makeNodeResolver());
    assert.equal(await evaluator.shouldPersist(makeWorkflow("wf-1", "SUCCESS"), undefined, args), true);
  });

  test("storagePolicy SUCCESS → does not persist when failed", async () => {
    const evaluator = new WorkflowStoragePolicyEvaluator(makeNodeResolver());
    const failedArgs = { ...args, finalStatus: "failed" as const };
    assert.equal(await evaluator.shouldPersist(makeWorkflow("wf-1", "SUCCESS"), undefined, failedArgs), false);
  });

  test("storagePolicy ERROR → does not persist when completed", async () => {
    const evaluator = new WorkflowStoragePolicyEvaluator(makeNodeResolver());
    assert.equal(await evaluator.shouldPersist(makeWorkflow("wf-1", "ERROR"), undefined, args), false);
  });

  test("storagePolicy ERROR → persists when failed", async () => {
    const evaluator = new WorkflowStoragePolicyEvaluator(makeNodeResolver());
    const failedArgs = { ...args, finalStatus: "failed" as const };
    assert.equal(await evaluator.shouldPersist(makeWorkflow("wf-1", "ERROR"), undefined, failedArgs), true);
  });

  test("storagePolicy as object resolver → delegates to resolver.shouldPersist", async () => {
    class PolicyToken {}
    const impl = { shouldPersist: async () => false };
    const resolver = makeNodeResolver(impl);
    const evaluator = new WorkflowStoragePolicyEvaluator(resolver);
    assert.equal(await evaluator.shouldPersist(makeWorkflow("wf-1", PolicyToken), undefined, args), false);
  });
});

describe("RunTerminalPersistenceCoordinator", () => {
  function makeState(runId = "run-1") {
    return {
      runId,
      workflowId: "wf-1",
      status: "completed" as const,
      startedAt: new Date().toISOString(),
      outputsByNode: {},
      policySnapshot: undefined,
    };
  }

  test("does not delete run when shouldPersist returns true", async () => {
    const deleted: string[] = [];
    const repo = {
      deleteRun: async (id: string) => {
        deleted.push(id);
      },
    } as unknown as Parameters<
      RunTerminalPersistenceCoordinator["maybeDeleteAfterTerminalState"]
    >[0]["workflow"] extends never
      ? never
      : import("../../src/types").WorkflowExecutionRepository;

    // Evaluator always says persist=true
    const evaluator = { shouldPersist: async () => true } as unknown as WorkflowStoragePolicyEvaluator;
    const coordinator = new RunTerminalPersistenceCoordinator(repo as never, evaluator);
    await coordinator.maybeDeleteAfterTerminalState({
      workflow: makeWorkflow(),
      state: makeState() as never,
      finalStatus: "completed",
      finishedAt: new Date().toISOString(),
    });
    assert.deepEqual(deleted, []);
  });

  test("deletes run when shouldPersist returns false and deleteRun exists", async () => {
    const deleted: string[] = [];
    const repo = {
      deleteRun: async (id: string) => {
        deleted.push(id);
      },
    } as never;

    const evaluator = { shouldPersist: async () => false } as unknown as WorkflowStoragePolicyEvaluator;
    const coordinator = new RunTerminalPersistenceCoordinator(repo, evaluator);
    await coordinator.maybeDeleteAfterTerminalState({
      workflow: makeWorkflow(),
      state: makeState("run-del") as never,
      finalStatus: "completed",
      finishedAt: new Date().toISOString(),
    });
    assert.deepEqual(deleted, ["run-del"]);
  });

  test("does not throw when shouldPersist=false but deleteRun is undefined", async () => {
    const repo = {} as never; // no deleteRun
    const evaluator = { shouldPersist: async () => false } as unknown as WorkflowStoragePolicyEvaluator;
    const coordinator = new RunTerminalPersistenceCoordinator(repo, evaluator);
    // Should not throw
    await coordinator.maybeDeleteAfterTerminalState({
      workflow: makeWorkflow(),
      state: makeState() as never,
      finalStatus: "failed",
      finishedAt: new Date().toISOString(),
    });
  });
});
