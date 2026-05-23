Load this when you need to see a complete workflow that exercises most authoring features end-to-end.

## The dense example (manual trigger — full fluent sugar)

The fluent `.map`/`.if`/`.switch`/`.split`/`.agent`/`.node` helpers are only available after `.manualTrigger(...)`. The example below is a manual-trigger workflow so it can demonstrate all of them. For cron / webhook variants, see the snippet at the bottom.

```ts
// src/workflows/dailyCsvDigest.ts
//
// Theme: a manual-triggered "daily CSV digest". Caller passes { date: "YYYY-MM-DD" }.
// The flow fetches that day's sales CSV from a reporting API, parses each row,
// classifies rows with an LLM agent, and sends a per-row digest email.
//
// Register in codemation.config.ts:
//   import dailyCsvDigest from "./src/workflows/dailyCsvDigest";
//   workflows: [dailyCsvDigest]

import { z } from "zod";
import { callableTool, itemExpr } from "@codemation/core";
import { HttpRequest } from "@codemation/core-nodes";
import { workflow } from "@codemation/host";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TriggerInput = { date: string }; // e.g. "2025-05-14"

type FetchMeta = {
  url: string;
  ok: boolean;
  status: number;
  binarySlot: string;
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
    // Fallback executor if the agent doesn't call the tool — keeps the workflow deterministic in tests.
    const classification =
      input.anomaly || input.revenue < 0 ? "critical" : input.revenue < 1000 ? "warning" : "normal";
    return { classification, rationale: `Revenue ${input.revenue}, anomaly=${input.anomaly}` };
  },
});

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

export default workflow("wf.daily-csv-digest")
  .name("Daily CSV Digest")
  // Manual trigger seeded with a default date — callers can override at run time.
  .manualTrigger<TriggerInput>("Start", { date: "2025-05-14" })

  // ── Step 1: build the fetch URL ────────────────────────────────────────────
  // async .map — use when you need await (date math here is sync, but the API call below is async).
  .map("Build fetch URL", async (item, _ctx) => ({
    date: item.json.date,
    reportUrl: `https://reports.internal/sales/${item.json.date}.csv`,
  }))

  // HttpRequest with responseFormat:"binary" stores the body in ctx.binary automatically.
  // Explicit id "fetch-report" keeps the credential binding stable across label renames.
  .then(
    new HttpRequest("Fetch report CSV", {
      id: "fetch-report",
      urlField: "reportUrl",
      responseFormat: "binary",
      responseBinarySlot: "csvFile",
      credentialSlot: "reportApi",
    }),
  )

  // ── Step 2: gate on HTTP success ───────────────────────────────────────────
  // .if predicate receives (item, ctx). Use for fast boolean branches; .switch is overkill for two outcomes.
  .if((item: { json: FetchMeta }, _ctx) => item.json.ok, {
    true: (branch) =>
      branch
        // ── Step 3: parse CSV from binary ──────────────────────────────────────
        // async .map — needs await to read from binary storage.
        .map("Parse CSV rows", async (item: { json: FetchMeta }, ctx) => {
          const stream = await ctx.binary.openReadStream(item.json.binarySlot);
          const text = await streamToText(stream);
          const rows = parseCsv(text);
          return { rows, fetchedAt: item.json.url };
        })

        // .split emits one item per CSV row so downstream steps run per-row.
        .split("Split rows", (item: { json: { rows: CsvRow[] } }) => item.json.rows)

        // ── Step 4: classify each row with an agent ──────────────────────────
        // itemExpr defers message construction to per-item runtime — required when content depends on the current item.
        .agent("Classify row", {
          model: "openai:gpt-4o-mini",
          messages: itemExpr(({ item }: { item: { json: CsvRow } }) => [
            { role: "system" as const, content: "You are a revenue analyst. Use classify_row." },
            { role: "user" as const, content: JSON.stringify(item.json) },
          ]),
          tools: [classifyRowTool],
          outputSchema: z.object({
            classification: z.enum(["normal", "warning", "critical"]),
            rationale: z.string(),
          }),
        })

        // ── Step 5: merge agent output with the original row via ctx.data ──────
        // ctx.data is keyed by node id (the slug of the node label).
        // "Split rows" slugs to "split-rows"; we read its emitted item back here.
        // sync .map — pure object merge, no I/O.
        .map("Enrich classification", (item: { json: { classification: string; rationale: string } }, ctx) => {
          const originalRow = ctx.data["split-rows"]?.items?.[0]?.json as CsvRow | undefined;
          return {
            ...originalRow,
            classification: item.json.classification as ClassifiedRow["classification"],
            rationale: item.json.rationale,
          } satisfies Partial<ClassifiedRow>;
        })

        // ── Step 6: send digest email via a registered node ───────────────────
        // .node(name, config, options) — explicit id keeps credential binding stable.
        // SendEmailNodeConfig is illustrative; replace with the email node available in your project.
        .node(
          "Send digest email",
          new SendEmailNodeConfig({
            // itemExpr on a config field — engine resolves once per item at execution time.
            subject: itemExpr(
              ({ item }: { item: { json: Partial<ClassifiedRow> } }) =>
                `[${item.json.classification?.toUpperCase()}] ${item.json.region} – ${item.json.product}`,
            ),
            to: "ops-team@example.com",
            body: itemExpr(
              ({ item }: { item: { json: Partial<ClassifiedRow> } }) =>
                `Region: ${item.json.region}\nRevenue: ${item.json.revenue}\nRationale: ${item.json.rationale}`,
            ),
          }),
          { id: "send-digest-email" },
        ),

    false: (branch) =>
      branch.map("Log fetch failure", (item: { json: FetchMeta }, _ctx) => ({
        error: `Fetch failed: HTTP ${item.json.status}`,
        url: item.json.url,
      })),
  })

  // .build() validates non-empty + unique node ids (including agent connection children).
  // Throws WorkflowDefinitionError on violation.
  .build();

// ---------------------------------------------------------------------------
// Helpers (inline for brevity — promote to lib/ if reused)
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

- **Manual trigger with typed default item** → `workflow("...").manualTrigger<TriggerInput>("Start", {...})`
- **sync `.map`** → "Enrich classification" — pure object merge, no `await`
- **async `.map`** → "Build fetch URL" and "Parse CSV rows" — uses `await` for binary read
- **`.if` per-item predicate** → `(item, _ctx) => item.json.ok` with branch factories
- **`HttpRequest` with explicit `id:`** → `id: "fetch-report"` (credential binding stability)
- **`.split`** → fan-out one batch into many items
- **`.agent(...)` with `messages`, `model`, `tools`, `outputSchema`** → typed structured output
- **`callableTool` with Zod schemas and `execute({ input })`** → inline tool definition
- **`itemExpr(...)`** → on agent messages (per-item content) and on `.node` config fields (per-item subject/body)
- **`.node(name, config, options)` with explicit id** → stable credential binding
- **`ctx.data["<slug>"]`** → reading earlier node output without threading it through every step
- **`ctx.binary.openReadStream(slot)`** → reading bytes from a binary slot attached upstream
- **`.build()`** → final validation pass

## Cron / webhook variant (alternative trigger)

When the trigger isn't manual, the fluent `.map`/`.if`/`.agent` sugar isn't available — you use the lower-level builder and `.then(new SomeNodeConfig(...))`. Shape:

```ts
import { Callback, CronTrigger, createWorkflowBuilder, HttpRequest } from "@codemation/core-nodes";

export default createWorkflowBuilder({
  id: "wf.daily-csv-digest.cron",
  name: "Daily CSV Digest (cron)",
})
  .trigger(new CronTrigger("Daily 06:00", { schedule: "0 6 * * *", timezone: "UTC" }))
  // Cron fires one item per tick: { firedAt, scheduledFor }. Wrap downstream logic in Callback configs:
  .then(
    new Callback("Build fetch URL", (items, _ctx) => {
      return items.map((item) => {
        const date = new Date((item.json as { scheduledFor: string }).scheduledFor).toISOString().slice(0, 10);
        return { date, reportUrl: `https://reports.internal/sales/${date}.csv` };
      });
    }),
  )
  .then(
    new HttpRequest("Fetch report CSV", {
      id: "fetch-report",
      urlField: "reportUrl",
      responseFormat: "binary",
      responseBinarySlot: "csvFile",
      credentialSlot: "reportApi",
    }),
  )
  // For branching, use `new If(...)`. For per-item agent calls, use `new AIAgent({...})`.
  // For row fan-out, use `new Split(...)`. The execution semantics match the fluent helpers
  // — only the surface syntax differs.
  .build();
```

If you need both cron + the fluent sugar in the same workflow, you can wrap the cursor manually:

```ts
import { WorkflowChain } from "@codemation/core-nodes";

const cursor = createWorkflowBuilder({ id, name }).trigger(new CronTrigger("Tick", { schedule: "..." }));
export default new WorkflowChain(cursor).map("First step", (item) => ({ ...item.json })).build();
```

This is uncommon in production code; reach for it only when the fluent helpers genuinely help readability.
