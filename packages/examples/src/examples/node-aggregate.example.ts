/**
 * @description Manual trigger with line items → Aggregate reduces all items to a single order summary.
 * Demonstrates Aggregate as the primary fan-in node: receives the whole batch, returns one output item.
 * @tags aggregate, reduce, fan-in, collect, summarize, batch, style:node
 * @uses @codemation/core-nodes, node:Aggregate
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import { Aggregate } from "@codemation/core-nodes";

type LineItem = Readonly<{
  sku: string;
  quantity: number;
  unitPriceUsd: number;
}>;

type OrderSummary = Readonly<{
  lineCount: number;
  totalUnits: number;
  totalUsd: number;
  skus: ReadonlyArray<string>;
}>;

export default workflow("example.node-aggregate")
  .name("Aggregate: reduce line items to order summary")
  .manualTrigger<LineItem>("Order line items", [
    { sku: "WIDGET-A", quantity: 3, unitPriceUsd: 9.99 },
    { sku: "WIDGET-B", quantity: 1, unitPriceUsd: 24.5 },
    { sku: "GADGET-C", quantity: 2, unitPriceUsd: 5.0 },
  ])
  // Aggregate collapses all items in the batch into a single output item.
  // Use it after Split + per-item processing to fan-in back to one result.
  // The aggregate function receives Items<TIn> (the full batch) and returns TOut.
  .then(
    new Aggregate<LineItem, OrderSummary>("Summarize order", (items) => ({
      lineCount: items.length,
      totalUnits: items.reduce((sum, item) => sum + item.json.quantity, 0),
      totalUsd: items.reduce((sum, item) => sum + item.json.quantity * item.json.unitPriceUsd, 0),
      skus: items.map((item) => item.json.sku),
    })),
  )
  .build();
