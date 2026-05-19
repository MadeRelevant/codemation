/**
 * Tests for EngineWorkflowRunnerService — covers unknown-workflowId throw
 * and the completed-immediately return path.
 */
import "reflect-metadata";

import assert from "node:assert/strict";
import { test, describe } from "vitest";

import { createRegistrarEngineTestKit } from "../harness/index.ts";
import { CallbackNodeConfig, chain } from "../harness/index.ts";
import { EngineWorkflowRunnerService } from "../../src/runtime/EngineWorkflowRunnerService";
import { InMemoryLiveWorkflowRepository } from "../../src/runtime/InMemoryLiveWorkflowRepository";

describe("EngineWorkflowRunnerService", () => {
  test("runById throws for unknown workflowId", async () => {
    const kit = createRegistrarEngineTestKit();
    await kit.start([]);
    // Access the service via the kit container
    const svc = new EngineWorkflowRunnerService(kit.engine, { get: () => undefined, list: () => [] } as never);
    await assert.rejects(() => svc.runById({ workflowId: "nonexistent", items: [] }), /Unknown workflowId/);
  });

  test("runById runs workflow to completion", async () => {
    const executed: boolean[] = [];
    const wf = chain({ id: "wf-runner-svc", name: "Runner" })
      .trigger(
        new (class {
          readonly kind = "trigger" as const;
          readonly type = this.constructor;
          readonly name = "T";
          readonly id = "trig";
        })() as never,
      )
      .then(
        new CallbackNodeConfig(
          "Step",
          () => {
            executed.push(true);
          },
          { id: "step" },
        ),
      )
      .build();

    const repo = new InMemoryLiveWorkflowRepository();
    repo.setWorkflows([wf]);
    const kit = createRegistrarEngineTestKit();
    await kit.start([wf]);
    const svc = new EngineWorkflowRunnerService(kit.engine, repo);
    const result = await svc.runById({ workflowId: "wf-runner-svc", startAt: "step", items: [{ json: {} }] });
    assert.equal(result.status, "completed");
  });
});
