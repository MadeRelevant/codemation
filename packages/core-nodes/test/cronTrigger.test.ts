import type { NodeExecutionContext, TriggerSetupContext, TriggerTestItemsContext } from "@codemation/core";
import {
  DefaultExecutionBinaryService,
  InMemoryBinaryStorage,
  InMemoryRunDataFactory,
} from "@codemation/core/bootstrap";
import assert from "node:assert/strict";
import { test } from "vitest";
import { CronTrigger, CronTriggerNode } from "../src/index.ts";

const FIXED_NOW = new Date("2026-03-17T12:00:00.000Z");

class CronTriggerContextFactory {
  static create(config: CronTrigger): NodeExecutionContext<CronTrigger> {
    const binary = new DefaultExecutionBinaryService(
      new InMemoryBinaryStorage(),
      "wf.cron.execute",
      "run_cron_execute",
      () => FIXED_NOW,
    );
    return {
      runId: "run_cron_execute",
      workflowId: "wf.cron.execute",
      nodeId: "trigger",
      activationId: "act_cron_execute",
      now: () => FIXED_NOW,
      data: new InMemoryRunDataFactory().create(),
      parent: undefined,
      binary: binary.forNode({ nodeId: "trigger", activationId: "act_cron_execute" }),
      config,
    };
  }

  static createTestItems(config: CronTrigger): TriggerTestItemsContext<CronTrigger> {
    const executionContext = this.create(config);
    return {
      runId: executionContext.runId,
      workflowId: executionContext.workflowId,
      now: executionContext.now,
      data: executionContext.data,
      parent: executionContext.parent,
      binary: executionContext.binary,
      trigger: {
        workflowId: executionContext.workflowId,
        nodeId: executionContext.nodeId,
      },
      nodeId: executionContext.nodeId,
      config,
      previousState: undefined,
    };
  }

  static createSetup(config: CronTrigger): {
    ctx: TriggerSetupContext<CronTrigger>;
    emittedItems: Array<Parameters<TriggerSetupContext["emit"]>[0]>;
    capturedCleanup: Array<{ stop: () => void | Promise<void> }>;
  } {
    const executionContext = this.create(config);
    const emittedItems: Array<Parameters<TriggerSetupContext["emit"]>[0]> = [];
    const capturedCleanup: Array<{ stop: () => void | Promise<void> }> = [];
    const ctx: TriggerSetupContext<CronTrigger> = {
      runId: executionContext.runId,
      workflowId: executionContext.workflowId,
      nodeId: executionContext.nodeId,
      activationId: executionContext.activationId,
      now: executionContext.now,
      data: executionContext.data,
      parent: executionContext.parent,
      binary: executionContext.binary,
      config,
      previousState: undefined,
      trigger: {
        workflowId: executionContext.workflowId,
        nodeId: executionContext.nodeId,
      },
      emit: async (items) => {
        emittedItems.push(items);
      },
      registerCleanup: (handle) => {
        capturedCleanup.push(handle);
      },
    };
    return { ctx, emittedItems, capturedCleanup };
  }
}

test("cron trigger constructor rejects an invalid cron expression", () => {
  assert.throws(() => new CronTrigger("bad", { schedule: "not a cron" }));
});

test("cron trigger constructor accepts a valid 5-field expression", () => {
  const config = new CronTrigger("every 5 minutes", { schedule: "*/5 * * * *" });
  assert.equal(config.schedule, "*/5 * * * *");
});

test("cron trigger constructor exposes schedule and optional timezone", () => {
  const config = new CronTrigger("nightly", { schedule: "0 3 * * *", timezone: "Europe/Amsterdam" });
  assert.equal(config.schedule, "0 3 * * *");
  assert.equal(config.timezone, "Europe/Amsterdam");
});

test("cron trigger execute is a pass-through", async () => {
  const node = new CronTriggerNode();
  const config = new CronTrigger("tick", { schedule: "* * * * *" });
  const item = { json: { value: 42 } };
  const outputs = await node.execute([item], CronTriggerContextFactory.create(config));
  assert.deepEqual(outputs.main, [item]);
});

test("cron trigger getTestItems returns one item with firedAt and scheduledFor ISO strings", async () => {
  const node = new CronTriggerNode();
  const config = new CronTrigger("tick", { schedule: "* * * * *" });
  const items = await node.getTestItems(CronTriggerContextFactory.createTestItems(config));
  assert.equal(items.length, 1);
  const json = items[0]?.json as Record<string, unknown>;
  assert.equal(json["firedAt"], FIXED_NOW.toISOString());
  assert.equal(json["scheduledFor"], FIXED_NOW.toISOString());
});

test("cron trigger setup registers a cleanup handle", async () => {
  const node = new CronTriggerNode();
  const config = new CronTrigger("tick", { schedule: "* * * * *" });
  const { ctx, capturedCleanup } = CronTriggerContextFactory.createSetup(config);

  await node.setup(ctx);

  assert.equal(capturedCleanup.length, 1);
  assert.doesNotThrow(() => capturedCleanup[0]?.stop());
});
