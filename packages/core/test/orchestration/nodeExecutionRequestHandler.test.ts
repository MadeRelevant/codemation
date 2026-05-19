/**
 * Tests for NodeExecutionRequestHandlerService guard branches —
 * covers the stale/mismatched request paths not hit by engine integration tests.
 */
import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { createEngineTestKit } from "../harness/index.ts";
import { CallbackNodeConfig } from "../harness/nodes.ts";

describe("NodeExecutionRequestHandlerService guard branches", () => {
  test("handleNodeExecutionRequest throws for unknown runId", async () => {
    const kit = createEngineTestKit();
    const wf = {
      id: "wf-handler-test",
      name: "Handler guards",
      nodes: [
        {
          id: "n1",
          kind: "node" as const,
          name: "N1",
          type: class {},
          config: new CallbackNodeConfig("N1", () => undefined),
        },
      ],
      edges: [],
    };
    await kit.start([wf]);
    // Calling handleNodeExecutionRequest with a runId that doesn't exist should throw
    await assert.rejects(
      () =>
        kit.engine.handleNodeExecutionRequest({
          runId: "nonexistent-run",
          workflowId: "wf-handler-test",
          activationId: "act-1",
          nodeId: "n1",
          input: [],
        }),
      /Unknown runId/,
    );
  });

  test("handleNodeExecutionRequest throws for workflowId mismatch", async () => {
    const kit = createEngineTestKit();
    const wf = {
      id: "wf-handler-mismatch",
      name: "Handler guards mismatch",
      nodes: [
        {
          id: "n1",
          kind: "node" as const,
          name: "N1",
          type: class {},
          config: new CallbackNodeConfig("N1", () => undefined),
        },
      ],
      edges: [],
    };
    await kit.start([wf]);
    // Start a run to get a valid runId
    const result = await kit.engine.runWorkflow(wf, "n1", [{ json: {} }]);
    if (result.status === "pending") {
      await kit.engine.waitForCompletion(result.runId);
    }
    // Create another run to test workflowId mismatch
    const wf2 = { ...wf, id: "wf-handler-mismatch-2" };
    await kit.start([wf, wf2]);
    const result2 = await kit.engine.runWorkflow(wf, "n1", [{ json: {} }]);
    const runId2 = result2.runId;

    if (result2.status === "pending") {
      await kit.engine.waitForCompletion(runId2);
    }
    // Try to handle the request with wrong workflowId for the run
    await assert.rejects(
      () =>
        kit.engine.handleNodeExecutionRequest({
          runId: runId2,
          workflowId: "completely-wrong-workflow",
          activationId: "act-x",
          nodeId: "n1",
          input: [],
        }),
      /workflowId mismatch/,
    );
  });

  test("handleNodeExecutionRequest is a no-op when run is already completed", async () => {
    // Complete a run normally, then try to handle a stale request
    const executed: number[] = [];
    const wf = {
      id: "wf-stale",
      name: "stale",
      nodes: [
        {
          id: "n1",
          kind: "node" as const,
          name: "N1",
          type: class {},
          config: new CallbackNodeConfig("N1", ({ items }) => {
            executed.push(items.length);
          }),
        },
      ],
      edges: [],
    };
    const kit = createEngineTestKit();
    await kit.start([wf]);
    const result = await kit.engine.runWorkflow(wf, "n1", [{ json: {} }]);
    const done = result.status === "pending" ? await kit.engine.waitForCompletion(result.runId) : result;
    assert.equal(done.status, "completed");

    const prevCount = executed.length;
    // Now try to handle an old request for the completed run
    await kit.engine.handleNodeExecutionRequest({
      runId: done.runId,
      workflowId: "wf-stale",
      activationId: "stale-act",
      nodeId: "n1",
      input: [],
    });
    // Node should not have been re-executed
    assert.equal(executed.length, prevCount);
  });
});
