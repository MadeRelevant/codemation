/**
 * @description Webhook trigger → validate payload (Zod) → write row to a workspace collection.
 * @tags webhook, http, inbound, validation, zod, database, store, collection, persist, style:scenario
 * @uses @codemation/core-nodes, node:WebhookTrigger, node:Callback
 * @dependencies @codemation/core-nodes@workspace:*
 */

// Non-manual triggers use createWorkflowBuilder + .trigger(new <Trigger>(...)).
import { createWorkflowBuilder, Callback, WebhookTrigger } from "@codemation/core-nodes";
import { z } from "zod";

const orderSchema = z.object({
  orderId: z.string(),
  customerId: z.string(),
  amount: z.coerce.number().positive(),
  currency: z.string().length(3),
});

type OrderPayload = z.infer<typeof orderSchema>;

// The collection "orders" must be declared in codemation.config.ts via defineCollection("orders", ...).
export default createWorkflowBuilder({ id: "example.webhook-to-db", name: "Webhook → validate → write to DB" })
  .trigger(
    new WebhookTrigger("Incoming order", {
      endpointKey: "order-created",
      methods: ["POST"],
      // Zod schema validates + coerces the request body before the workflow proceeds.
      inputSchema: orderSchema,
    }),
  )
  .then(
    new Callback<OrderPayload, Record<string, unknown>>("Write order row", async (items, ctx) => {
      const store = ctx.collections?.["orders"];
      if (!store) throw new Error('Collection "orders" not registered in codemation.config.ts');
      return await Promise.all(
        items.map(async (item) => {
          const row = await store.insert({
            ...item.json,
            receivedAt: new Date().toISOString(),
            status: "pending" as const,
          });
          return { ...item, json: row as Record<string, unknown> };
        }),
      );
    }),
  )
  .build();
