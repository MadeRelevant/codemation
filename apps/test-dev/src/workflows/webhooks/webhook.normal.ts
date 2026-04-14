/**
 * Webhook-triggered workflow: the fluent `workflow()` helper starts from `manualTrigger` today; use
 * `createWorkflowBuilder` with `WebhookTrigger` (or other non-manual triggers).
 */
import { createWorkflowBuilder, MapData, WebhookTrigger } from "@codemation/core-nodes";
import { z } from "zod";

export default createWorkflowBuilder({ id: "wf.webhook.normal", name: "Webhook normal completion" })
  .trigger(
    new WebhookTrigger(
      "Order created webhook",
      {
        endpointKey: "order-created",
        methods: ["POST"],
        inputSchema: z.object({
          orderId: z.string(),
          amount: z.coerce.number(),
        }),
      },
      undefined,
      "webhook_trigger",
    ),
  )
  .then(
    new MapData(
      "Format webhook response",
      (item) => {
        const payload = item.json as Readonly<{
          json?: Readonly<{ orderId: string; amount: number }>;
          method: string;
        }>;
        return {
          ok: true,
          mode: "normal",
          method: payload.method,
          orderId: payload.json?.orderId,
          amount: payload.json?.amount,
        };
      },
      { id: "format_response" },
    ),
  )
  .build();
