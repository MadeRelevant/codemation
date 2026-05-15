Load this when you need to see a complete workflow that exercises most authoring features end-to-end.

```ts
// src/workflows/dailyCsvDigest.ts
//
// Theme: every day at 06:00 UTC, fetch yesterday's sales CSV from a reporting API,
// parse each row, classify rows with an LLM agent, then send a digest email.
//
// Register in codemation.config.ts:
//   import dailyCsvDigest from "./src/workflows/dailyCsvDigest";
//   workflows: [dailyCsvDigest]

import { z } from "zod";
import { callableTool, itemExpr } from "@codemation/core";
import { CronTrigger, HttpRequest } from "@codemation/core-nodes";
import { workflow } from "@codemation/host";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CronTick = { firedAt: string; scheduledFor: string };

type FetchMeta = {
  url: string;
  ok: boolean;
  status: number;
  binarySlot: string; // set when responseFormat === "binary"
};

type CsvRow = {
  region: string;
  product: string;
  revenue: number;
  anomaly: boolean;
};

type ClassifiedRow = CsvRow & {
  classification: "normal" | "warning" | "critical";
  rationale: string;
};

// ---------------------------------------------------------------------------
// Inline callable tool — classify a single row
// ---------------------------------------------------------------------------

const classifyRowTool = callableTool({
  name: "classify_row",
  description: "Classify a revenue row as normal, warning, or critical.",
  inputSchema: z.object({
    region: z.string(),
    product: z.string(),
    revenue: z.number(),
    anomaly: z.boolean(),
  }),
  outputSchema: z.object({
    classification: z.enum(["normal", "warning", "critical"]),
    rationale: z.string(),
  }),
  execute: async ({ input }) => {
    // Inline logic: in practice the agent decides; this is the fallback executor.
    const classification =
      input.anomaly || input.revenue < 0 ? "critical" : input.revenue < 1000 ? "warning" : "normal";
    return {
      classification,
      rationale: `Revenue ${input.revenue}, anomaly=${input.anomaly}`,
    };
  },
});

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export default workflow("wf.daily-csv-digest")
  .name("Daily CSV Digest")
  // CronTrigger must be attached with builder.trigger(new CronTrigger(...)) —
  // not .manualTrigger() — because it's a non-manual trigger type.
  .trigger(new CronTrigger("Daily 06:00", { schedule: "0 6 * * *", timezone: "UTC" }))

  // ── Step 1: fetch the CSV ─────────────────────────────────────────────────
  // async .map — use async when you need await (e.g. date math, API calls in prep).
  .map("Build fetch URL", async (item: { json: CronTick }, _ctx) => {
    const yesterday = new Date(item.json.scheduledFor);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    const date = yesterday.toISOString().slice(0, 10); // "2025-05-14"
    return { date, reportUrl: `https://reports.internal/sales/${date}.csv` };
  })

  // HttpRequest with responseFormat:"binary" stores the body in ctx.binary automatically.
  // Explicit id: "fetch-report" is stable so credential binding survives label renames.
  .then(
    new HttpRequest("Fetch report CSV", {
      id: "fetch-report", // stable id — credential binding key is (workflowId, nodeId, slotKey)
      urlField: "reportUrl",
      responseFormat: "binary", // body stored in binary["response"]; item.json gets FetchMeta
      responseBinarySlot: "csvFile",
      credentialSlot: "reportApi", // bound in the canvas credential panel
    }),
  )

  // ── Step 2: skip on HTTP error ────────────────────────────────────────────
  // .if predicate receives (item, ctx) — per-item, synchronous; use for fast boolean gates.
  // .switch would be overkill here: only two outcomes, no string case routing needed.
  .if((item: { json: FetchMeta }, _ctx) => item.json.ok, {
    true: (branch) =>
      branch
        // ── Step 3: parse CSV from binary ──────────────────────────────────────
        // async .map — needs await to read from binary storage.
        .map("Parse CSV rows", async (item: { json: FetchMeta }, ctx) => {
          // ctx.binary.openReadStream works because the binary slot was attached upstream.
          const stream = await ctx.binary.openReadStream(item.json.binarySlot);
          const text = await streamToText(stream);
          const rows = parseCsv(text); // returns CsvRow[]
          // Attach the raw bytes again under a stable slot name for downstream nodes.
          const att = await ctx.binary.attach({
            name: "csvFile",
            body: Buffer.from(text, "utf-8"),
            mimeType: "text/csv",
            filename: `sales-${(item.json as unknown as { date?: string }).date ?? "unknown"}.csv`,
          });
          return ctx.binary.withAttachment({ rows, fetchedAt: item.json.url }, "csvFile", att);
        })

        // split: one item per CSV row so the agent step runs per-row.
        .split("Split rows", (item: { json: { rows: CsvRow[] } }) => item.json.rows)

        // ── Step 4: classify each row with an agent ──────────────────────────
        // itemExpr defers evaluation to per-item runtime — needed here because message
        // content depends on item.json fields that differ for each row in the batch.
        .agent("Classify row", {
          model: "openai:gpt-4o-mini",
          messages: itemExpr(({ item }: { item: { json: CsvRow } }) => [
            {
              role: "system" as const,
              content: "You are a revenue analyst. Use the classify_row tool to classify this row.",
            },
            {
              role: "user" as const,
              content: JSON.stringify(item.json),
            },
          ]),
          tools: [classifyRowTool],
          outputSchema: z.object({
            classification: z.enum(["normal", "warning", "critical"]),
            rationale: z.string(),
          }),
        })

        // ── Step 5: enrich item with original row fields via ctx.data ─────────
        // ctx.data["split-rows"] holds the completed output of the "Split rows" node.
        // Use ctx.data to read upstream node outputs without threading them through
        // every intermediate step manually.
        // sync .map — no await, pure field merge; use sync when no I/O is needed.
        .map("Enrich classification", (item: { json: { classification: string; rationale: string } }, ctx) => {
          // ctx.data is keyed by node id (slug of "Split rows" → "split-rows")
          const originalRow = ctx.data["split-rows"]?.items?.[0]?.json as CsvRow | undefined;
          return {
            ...originalRow,
            classification: item.json.classification as ClassifiedRow["classification"],
            rationale: item.json.rationale,
          } satisfies Partial<ClassifiedRow>;
        })

        // ── Step 6: send digest email via a registered node ───────────────────
        // .node(definition, config, name, id) — explicit id keeps credential binding stable.
        // "SendEmailNodeConfig" is illustrative; adapt to your actual email node definition.
        .node(
          "SendEmailNodeConfig", // (adapt to your actual node — e.g. import { sendEmailNode } from "@codemation/core-nodes-email")
          {
            // itemExpr on a config field: the "to" address is fixed but "subject" varies per item.
            // itemExpr tells the engine to resolve this field once per item at execution time.
            subject: itemExpr(
              ({ item }: { item: { json: Partial<ClassifiedRow> } }) =>
                `[${item.json.classification?.toUpperCase()}] ${item.json.region} – ${item.json.product}`,
            ),
            to: "ops-team@example.com",
            body: itemExpr(
              ({ item }: { item: { json: Partial<ClassifiedRow> } }) =>
                `Region: ${item.json.region}\nRevenue: ${item.json.revenue}\nRationale: ${item.json.rationale}`,
            ),
          },
          "Send digest email",
          "send-digest-email", // explicit id — credential binding survives label renames
        ),

    false: (branch) =>
      branch.map("Log fetch failure", (item: { json: FetchMeta }, _ctx) => ({
        error: `Fetch failed: HTTP ${item.json.status}`,
        url: item.json.url,
      })),
  })

  // .build() finalises the definition: validates that all node ids are non-empty
  // and unique (including agent connection children). Throws WorkflowDefinitionError otherwise.
  .build();

// ---------------------------------------------------------------------------
// Helpers (not part of the DSL — inline for brevity)
// ---------------------------------------------------------------------------

async function streamToText(stream: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf-8");
}

function parseCsv(text: string): CsvRow[] {
  const [header, ...lines] = text.trim().split("\n");
  const cols = header!.split(",");
  return lines.map((line) => {
    const vals = line.split(",");
    return {
      region: vals[cols.indexOf("region")] ?? "",
      product: vals[cols.indexOf("product")] ?? "",
      revenue: Number(vals[cols.indexOf("revenue")] ?? 0),
      anomaly: vals[cols.indexOf("anomaly")] === "true",
    };
  });
}
```

## What this exercises

- **Cron trigger construction** → line 65 (`new CronTrigger(...)` + `.trigger(...)`)
- **sync `.map`** → line 117 ("Enrich classification" — pure field merge, no `await`)
- **async `.map`** → line 68 ("Build fetch URL") and line 92 ("Parse CSV rows")
- **`.if` per-item predicate** → line 81 (`(item, _ctx) => item.json.ok`)
- **`HttpRequest` with explicit `id:`** → line 75 (`id: "fetch-report"`, comment on credential binding stability)
- **`.node(def, config, name, id)` with explicit id** → line 131 (`"send-digest-email"`, same stability rationale)
- **`itemExpr(...)` on a config field** → lines 133–140 (subject + body depend on current item)
- **`.agent(...)` with `messages`, `model`, `callableTool`** → line 103
- **`callableTool` with Zod `inputSchema` and `execute({ input })`** → line 37
- **`ctx.data` downstream node output access** → line 120 (`ctx.data["split-rows"]`)
- **`ctx.binary.attach` + `ctx.binary.openReadStream`** → lines 94–102
- **`.build()` validation** → line 151 (comment on what it checks)
