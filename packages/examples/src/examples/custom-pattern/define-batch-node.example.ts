/**
 * @description Define a custom batch node via defineBatchNode — run() receives ALL items at once
 * and must return one output per input row. Demonstrates a rank-within-batch transform: each item
 * gets its rank and percentage-of-total computed against the full batch, something per-item
 * execute() cannot do (it sees only one item at a time).
 * Use defineBatchNode when the transform requires batch context (totals, rankings, dedup across rows).
 * Use defineNode (per-item execute) for everything that only needs the current item.
 * @tags defineBatchNode batch custom-node aggregate rank style:node
 * @uses defineBatchNode, node:rankSalesByRevenue
 * @dependencies @codemation/core@workspace:*
 */

import { workflow } from "@codemation/host";
import { defineBatchNode } from "@codemation/core";

// ----- Step 1: Define the batch node -----
//
// defineBatchNode differs from defineNode in one key way:
//   - defineNode:      execute(args, ctx) — called once per item; each call is independent.
//   - defineBatchNode: run(items, ctx)    — called ONCE on the last item in the batch;
//                                          receives plain JSON values (not Item wrappers).
//                                          Must return ReadonlyArray<TOutputJson> of equal length.
//
// The engine skips intermediate items (returns []) and only triggers run() on the final item,
// so never rely on ordering side-effects in previous-item calls.
type SaleRow = Readonly<{
  salesRepId: string;
  revenueUsd: number;
}>;

type RankedSaleRow = Readonly<{
  salesRepId: string;
  revenueUsd: number;
  rank: number;
  pctOfTotal: number;
}>;

export const rankSalesByRevenue = defineBatchNode<
  "example.rank-sales-by-revenue",
  Record<string, never>,
  SaleRow,
  RankedSaleRow
>({
  key: "example.rank-sales-by-revenue",
  title: "Rank sales by revenue",
  description:
    "Ranks each row by revenue descending and computes each row's share of the total. Requires the full batch — use defineBatchNode.",
  icon: "lucide:bar-chart-2",
  // run() receives plain TInputJson[] (not Item<> wrappers).
  // Return a ReadonlyArray<TOutputJson> of the SAME LENGTH — one entry per input row.
  run(items) {
    const total = items.reduce((sum, row) => sum + row.revenueUsd, 0);
    // Sort descending to determine rank, but preserve original positions for 1:1 output.
    const sorted = [...items].sort((a, b) => b.revenueUsd - a.revenueUsd);
    const rankMap = new Map<string, number>(sorted.map((row, index) => [row.salesRepId, index + 1]));
    return items.map((row) => ({
      salesRepId: row.salesRepId,
      revenueUsd: row.revenueUsd,
      rank: rankMap.get(row.salesRepId) ?? items.length,
      pctOfTotal: total > 0 ? Math.round((row.revenueUsd / total) * 10000) / 100 : 0,
    }));
  },
});

// ----- Step 2: Use the batch node in a workflow -----

export default workflow("example.define-batch-node")
  .name("defineBatchNode: rank sales rows by revenue")
  .manualTrigger<SaleRow>("Sales rows", [
    { salesRepId: "alice", revenueUsd: 42000 },
    { salesRepId: "bob", revenueUsd: 18500 },
    { salesRepId: "carol", revenueUsd: 63200 },
    { salesRepId: "dave", revenueUsd: 9100 },
  ])
  // rankSalesByRevenue.create(config, label, id)
  // config is empty ({}) because this node has no static configuration fields.
  .then(rankSalesByRevenue.create({}, "Rank sales by revenue", "rank-sales"))
  .build();
