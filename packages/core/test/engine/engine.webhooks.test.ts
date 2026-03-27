import assert from "node:assert/strict";
import { test } from "vitest";

import type {
  ExecutableTriggerNode,
  Items,
  NodeExecutionContext,
  NodeOutputs,
  TriggerNodeConfig,
  TriggerSetupContext,
  TypeToken,
  WebhookControlSignal,
  WorkflowDefinition,
} from "../../src/index.ts";
import { WorkflowBuilder } from "../../src/index.ts";
import { CallbackNodeConfig, createEngineTestKit, items } from "../harness/index.ts";

class WebhookRunResultFactory {
  static async run(
    engine: {
      runWorkflow: (
        wf: WorkflowDefinition,
        startAt: string,
        input: Items,
        parent: undefined,
        executionOptions: Readonly<{ localOnly: true; webhook: true }>,
      ) => Promise<any>;
      waitForWebhookResponse: (runId: string) => Promise<any>;
      waitForCompletion: (runId: string) => Promise<any>;
    },
    workflow: WorkflowDefinition,
    itemsToSend: Items,
  ): Promise<{
    runId: string;
    workflowId: string;
    startedAt: string;
    runStatus: "pending" | "completed";
    response: Items;
  }> {
    const scheduled = await engine.runWorkflow(workflow, "trigger", itemsToSend, undefined, {
      localOnly: true,
      webhook: true,
    });
    if (scheduled.status === "failed") {
      throw new Error(scheduled.error.message);
    }
    if (scheduled.status === "completed") {
      return {
        runId: scheduled.runId,
        workflowId: scheduled.workflowId,
        startedAt: scheduled.startedAt,
        runStatus: "completed",
        response: scheduled.outputs,
      };
    }
    return await Promise.race([
      engine.waitForWebhookResponse(scheduled.runId),
      engine.waitForCompletion(scheduled.runId).then((completed) => {
        if (completed.status === "failed") {
          throw new Error(completed.error.message);
        }
        return {
          runId: completed.runId,
          workflowId: completed.workflowId,
          startedAt: completed.startedAt,
          runStatus: "completed" as const,
          response: completed.outputs,
        };
      }),
    ]);
  }
}

class WebhookTestTriggerConfig implements TriggerNodeConfig<unknown> {
  readonly kind = "trigger" as const;
  readonly type: TypeToken<unknown> = WebhookTestTriggerNode;

  constructor(
    public readonly name: string,
    public readonly onExecute: (items: Items) => Promise<NodeOutputs> | NodeOutputs,
    public readonly id?: string,
  ) {}
}

class WebhookTestTriggerNode implements ExecutableTriggerNode<WebhookTestTriggerConfig> {
  readonly kind = "trigger" as const;
  readonly outputPorts = ["main"] as const;

  async setup(_ctx: TriggerSetupContext<WebhookTestTriggerConfig>): Promise<undefined> {
    return undefined;
  }

  async execute(items: Items, ctx: NodeExecutionContext<WebhookTestTriggerConfig>): Promise<NodeOutputs> {
    return await ctx.config.onExecute(items);
  }
}

class TestWebhookRespondNowError extends Error implements WebhookControlSignal {
  readonly __webhookControl = true as const;
  readonly kind = "respondNow" as const;

  constructor(public readonly responseItems: Items) {
    super("Webhook responded immediately");
  }
}

class TestWebhookRespondNowAndContinueError extends Error implements WebhookControlSignal {
  readonly __webhookControl = true as const;
  readonly kind = "respondNowAndContinue" as const;

  constructor(
    public readonly responseItems: Items,
    public readonly continueItems: Items,
  ) {
    super("Webhook responded immediately and continued");
  }
}

test("webhook runs execute the matched trigger first and keep worker-hinted downstream nodes local", async () => {
  const events: string[] = [];
  const trigger = new WebhookTestTriggerConfig(
    "Webhook trigger",
    async (input) => {
      events.push("trigger");
      return { main: input };
    },
    "trigger",
  );
  const workerPreferredNode = new CallbackNodeConfig(
    "Worker preferred",
    () => {
      events.push("downstream");
    },
    {
      id: "worker_preferred",
      execution: { hint: "worker", queue: "q.webhooks" },
    },
  );
  const workflow = new WorkflowBuilder({ id: "wf.webhook.local-only", name: "Webhook local-only" })
    .trigger(trigger)
    .then(workerPreferredNode)
    .build();

  const kit = createEngineTestKit();
  await kit.start([workflow]);

  const result = await WebhookRunResultFactory.run(kit.engine as any, workflow, items([{ orderId: "ord_1" }]));

  assert.equal(result.runStatus, "completed");
  assert.deepEqual(
    result.response.map((item) => item.json),
    [{ orderId: "ord_1" }],
  );
  assert.equal(events.join(","), "trigger,downstream");
  const stored = await kit.runStore.load(result.runId);
  assert.equal(stored?.nodeSnapshotsByNodeId.trigger?.status, "completed");
  assert.equal((kit.scheduler as { requests?: ReadonlyArray<unknown> }).requests?.length ?? 0, 0);
});

test("webhook respond-now control signals complete the run and stop downstream execution", async () => {
  const events: string[] = [];
  const trigger = new WebhookTestTriggerConfig(
    "Webhook trigger",
    async () => {
      events.push("trigger");
      throw new TestWebhookRespondNowError(items([{ accepted: true }]));
    },
    "trigger",
  );
  const downstream = new CallbackNodeConfig(
    "Downstream",
    () => {
      events.push("downstream");
    },
    { id: "downstream" },
  );
  const workflow = new WorkflowBuilder({ id: "wf.webhook.stop", name: "Webhook stop" })
    .trigger(trigger)
    .then(downstream)
    .build();

  const kit = createEngineTestKit();
  await kit.start([workflow]);

  const result = await WebhookRunResultFactory.run(kit.engine as any, workflow, items([{ ignored: true }]));
  const stored = await kit.runStore.load(result.runId);

  assert.equal(result.runStatus, "completed");
  assert.deepEqual(
    result.response.map((item) => item.json),
    [{ accepted: true }],
  );
  assert.equal(stored?.status, "completed");
  assert.equal(events.join(","), "trigger");
});

test("webhook respond-now-and-continue control signals return immediately and keep processing with carried items", async () => {
  const downstreamInputs: Array<unknown> = [];
  const trigger = new WebhookTestTriggerConfig(
    "Webhook trigger",
    async () => {
      throw new TestWebhookRespondNowAndContinueError(items([{ accepted: true }]), items([{ forwarded: "payload" }]));
    },
    "trigger",
  );
  const downstream = new CallbackNodeConfig(
    "Downstream",
    ({ items: received }) => {
      downstreamInputs.push(...received.map((item) => item.json));
    },
    { id: "downstream" },
  );
  const workflow = new WorkflowBuilder({ id: "wf.webhook.continue", name: "Webhook continue" })
    .trigger(trigger)
    .then(downstream)
    .build();

  const kit = createEngineTestKit();
  await kit.start([workflow]);

  const result = await WebhookRunResultFactory.run(kit.engine as any, workflow, items([{ ignored: true }]));
  const completed = await kit.engine.waitForCompletion(result.runId);
  const stored = await kit.runStore.load(result.runId);

  assert.equal(result.runStatus, "pending");
  assert.deepEqual(
    result.response.map((item) => item.json),
    [{ accepted: true }],
  );
  assert.equal(completed.status, "completed");
  assert.deepEqual(downstreamInputs, [{ forwarded: "payload" }]);
  assert.equal(stored?.status, "completed");
});
