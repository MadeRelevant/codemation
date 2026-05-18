/**
 * @description Webhook with array payload → Split to fan-out per item → map each → Aggregate to fan-in.
 * Demonstrates parallelism in the DSL: Split expands the batch, MapData processes each element,
 * Aggregate collapses all results back to a single summary item.
 * @tags map, fanout, fan-in, parallel, array, split, aggregate, batch, transform, style:scenario
 * @uses @codemation/core-nodes, node:WebhookTrigger, node:Split, node:MapData, node:Aggregate
 * @dependencies @codemation/core-nodes@workspace:*
 */

// Non-manual triggers use createWorkflowBuilder + .trigger(new <Trigger>(...)).
import { createWorkflowBuilder, WebhookTrigger, Split, MapData, Aggregate } from "@codemation/core-nodes";

type BatchPayload = Readonly<{
  items: ReadonlyArray<{ id: string; price: number; currency: string }>;
}>;

type LineItem = Readonly<{ id: string; price: number; currency: string }>;

type ProcessedItem = LineItem & Readonly<{ priceUsd: number }>;

type OrderSummary = Readonly<{
  count: number;
  totalUsd: number;
  items: ReadonlyArray<ProcessedItem>;
}>;

// A fixed EUR→USD rate for demonstration; use a live FX API call in a real workflow.
const EUR_TO_USD = 1.08;

export default createWorkflowBuilder({
  id: "example.map-fanout-fanin",
  name: "Fan-out map → fan-in aggregate",
})
  .trigger(
    new WebhookTrigger("Order batch", {
      endpointKey: "order-batch",
      methods: ["POST"],
    }),
  )
  // Fan-out: one item per line item in the array.
  .then(new Split<BatchPayload, LineItem>("Split line items", (item) => [...item.json.items]))
  // Process each item independently (parallelism is handled by the engine).
  .then(
    new MapData<LineItem, ProcessedItem>("Convert to USD", (item) => ({
      ...item.json,
      priceUsd: item.json.currency === "EUR" ? item.json.price * EUR_TO_USD : item.json.price,
    })),
  )
  // Fan-in: collapse all processed items into one summary.
  .then(
    new Aggregate<ProcessedItem, OrderSummary>("Aggregate totals", (items) => ({
      count: items.length,
      totalUsd: items.reduce((sum, i) => sum + i.json.priceUsd, 0),
      items: items.map((i) => i.json),
    })),
  )
  .build();
