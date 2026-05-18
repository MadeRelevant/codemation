/**
 * @description Manual trigger with mixed product list → Filter keeps only in-stock items → MapData shapes output.
 * Demonstrates Filter as the primary node: predicate receives item + index + full batch, returns boolean.
 * @tags filter, predicate, conditional, array, keep, drop, discard, style:node
 * @uses @codemation/core-nodes, node:Filter
 * @dependencies @codemation/core-nodes@workspace:*
 */

import { workflow } from "@codemation/host";
import { Filter, MapData } from "@codemation/core-nodes";

type Product = Readonly<{
  id: string;
  name: string;
  stock: number;
  price: number;
}>;

type AvailableProduct = Readonly<{
  id: string;
  name: string;
  price: number;
}>;

export default workflow("example.node-filter")
  .name("Filter: keep in-stock products only")
  .manualTrigger<Product>("Product catalog", [
    { id: "p1", name: "Widget A", stock: 5, price: 9.99 },
    { id: "p2", name: "Widget B", stock: 0, price: 14.99 },
    { id: "p3", name: "Widget C", stock: 12, price: 4.5 },
    { id: "p4", name: "Widget D", stock: 0, price: 22.0 },
  ])
  // Filter drops items for which the predicate returns false.
  // Items that pass are forwarded unchanged on the main port.
  // Use Filter (not If) when you want a single output stream of passing items with no branch.
  .then(new Filter<Product>("Keep in-stock", (item) => item.json.stock > 0))
  .then(
    new MapData<Product, AvailableProduct>("Strip stock count", (item) => ({
      id: item.json.id,
      name: item.json.name,
      price: item.json.price,
    })),
  )
  .build();
