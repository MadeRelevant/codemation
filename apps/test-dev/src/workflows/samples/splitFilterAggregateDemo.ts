import { workflow } from "@codemation/host";
import { Aggregate, Filter, Split } from "@codemation/core-nodes";

/**
 * Demonstrates built-in batch shaping nodes:
 * - {@link Split}: one item whose `json` holds an array → one item per array element
 * - {@link Filter}: keep items matching a predicate on `main`
 * - {@link Aggregate}: collapse the current batch to a single summary item on `main`
 */
type ReadingRow = Readonly<{
  site: string;
  c: number;
}>;

type SensorBatchJson = Readonly<{
  rows: readonly ReadingRow[];
}>;

export default workflow("wf.samples.split-filter-aggregate")
  .name("Split → filter → aggregate demo")
  .manualTrigger<SensorBatchJson>("Manual trigger", [
    {
      rows: [
        { site: "warehouse-7", c: 3 },
        { site: "warehouse-7", c: 22 },
        { site: "warehouse-7", c: 18 },
        { site: "warehouse-7", c: 40 },
        { site: "warehouse-7", c: 7 },
        { site: "warehouse-7", c: 35 },
      ],
    },
  ])
  .then(new Split<SensorBatchJson, ReadingRow>("Split rows", (item) => [...item.json.rows]))
  .then(new Filter<ReadingRow>("Keep warm (≥15°C)", (item) => item.json.c >= 15))
  .then(
    new Aggregate<ReadingRow, Readonly<{ site: string; sum: number; count: number; max: number; min: number }>>(
      "Aggregate stats",
      (items) => {
        const site = items[0]?.json.site ?? "unknown";
        const values = items.map((i) => i.json.c);
        const sum = values.reduce((a, v) => a + v, 0);
        return {
          site,
          sum,
          count: values.length,
          max: values.length ? Math.max(...values) : 0,
          min: values.length ? Math.min(...values) : 0,
        };
      },
    ),
  )
  .build();
