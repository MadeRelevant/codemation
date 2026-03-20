import type { NodeExecutionContext,TriggerSetupContext,WebhookSpec } from "@codemation/core";
import { DefaultExecutionBinaryService,InMemoryBinaryStorage,InMemoryRunDataFactory } from "@codemation/core";
import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { WebhookTrigger,WebhookTriggerNode } from "../dist/index.js";

class CapturedWebhookSpecStore {
  private spec: WebhookSpec | undefined;

  set(spec: WebhookSpec): void {
    this.spec = spec;
  }

  get(): WebhookSpec {
    if (!this.spec) {
      throw new Error("Expected a webhook registration.");
    }
    return this.spec;
  }
}

class WebhookTriggerContextFactory {
  static create(store: CapturedWebhookSpecStore): TriggerSetupContext<WebhookTrigger<any>> {
    const binary = new DefaultExecutionBinaryService(new InMemoryBinaryStorage(), "wf.webhook.setup", "run_webhook_setup", () => new Date("2026-03-11T12:00:00.000Z"));
    return {
      runId: "run_webhook_setup",
      workflowId: "wf.webhook.setup",
      now: () => new Date("2026-03-11T12:00:00.000Z"),
      data: new InMemoryRunDataFactory().create(),
      binary,
      trigger: { workflowId: "wf.webhook.setup", nodeId: "trigger" },
      previousState: undefined,
      config: new WebhookTrigger(
        "Webhook trigger",
        {
          endpointKey: "incoming",
          methods: ["POST", "PATCH"],
          inputSchema: z.object({
            eventId: z.string(),
            count: z.coerce.number(),
          }),
        },
        undefined,
        "trigger",
      ),
      registerWebhook(spec) {
        store.set(spec);
        return {
          endpointId: "wf.webhook.setup.trigger.incoming",
          methods: spec.methods,
          path: "/api/webhooks/wf.webhook.setup.trigger.incoming",
        };
      },
      emit: async () => {},
      parent: undefined,
    };
  }
}

class WebhookTriggerExecutionContextFactory {
  static create(config?: WebhookTrigger<any>): NodeExecutionContext<WebhookTrigger<any>> {
    const binary = new DefaultExecutionBinaryService(new InMemoryBinaryStorage(), "wf.webhook.execute", "run_webhook_execute", () => new Date("2026-03-11T12:00:00.000Z"));
    return {
      runId: "run_webhook_execute",
      workflowId: "wf.webhook.execute",
      nodeId: "trigger",
      activationId: "act_webhook_execute",
      now: () => new Date("2026-03-11T12:00:00.000Z"),
      data: new InMemoryRunDataFactory().create(),
      parent: undefined,
      binary: binary.forNode({ nodeId: "trigger", activationId: "act_webhook_execute" }),
      config:
        config ??
        new WebhookTrigger(
          "Webhook trigger",
          {
            endpointKey: "incoming",
            methods: ["POST"],
          },
          undefined,
          "trigger",
        ),
    };
  }
}

test("webhook trigger registers all configured methods and its zod-backed parser", async () => {
  const store = new CapturedWebhookSpecStore();
  const node = new WebhookTriggerNode();

  await node.setup(WebhookTriggerContextFactory.create(store));

  const spec = store.get();
  assert.deepEqual(spec.methods, ["POST", "PATCH"]);
  assert.deepEqual(spec.parseJsonBody?.({ eventId: "evt_1", count: "2" }), {
    eventId: "evt_1",
    count: 2,
  });
});

test("webhook trigger fails fast when manual execution provides no webhook items", async () => {
  const node = new WebhookTriggerNode();

  await assert.rejects(
    async () => {
      await node.execute([], WebhookTriggerExecutionContextFactory.create());
    },
    {
      message:
        'Webhook trigger "Webhook trigger" requires a webhook request. Invoke this workflow through its webhook endpoint until manual request simulation is supported.',
    },
  );
});
