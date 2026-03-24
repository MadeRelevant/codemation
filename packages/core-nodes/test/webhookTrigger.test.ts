import type { NodeExecutionContext } from "@codemation/core";
import { DefaultExecutionBinaryService, InMemoryBinaryStorage, InMemoryRunDataFactory } from "@codemation/core";
import assert from "node:assert/strict";
import { test } from "vitest";
import { z } from "zod";
import { WebhookTrigger, WebhookTriggerNode } from "@codemation/core-nodes";

class WebhookTriggerExecutionContextFactory {
  static create(config?: WebhookTrigger<any>): NodeExecutionContext<WebhookTrigger<any>> {
    const binary = new DefaultExecutionBinaryService(
      new InMemoryBinaryStorage(),
      "wf.webhook.execute",
      "run_webhook_execute",
      () => new Date("2026-03-11T12:00:00.000Z"),
    );
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

test("webhook trigger config exposes zod-backed JSON parsing for HTTP ingress", async () => {
  const config = new WebhookTrigger(
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
  );

  assert.deepEqual(config.methods, ["POST", "PATCH"]);
  assert.deepEqual(config.parseJsonBody({ eventId: "evt_1", count: "2" }), {
    eventId: "evt_1",
    count: 2,
  });
});

test("webhook trigger setup is a no-op", async () => {
  const node = new WebhookTriggerNode();
  await node.setup({} as never);
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
