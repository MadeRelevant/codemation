# Tagging discipline

> See [AUTHORING.md](AUTHORING.md) for the full frontmatter format. This doc covers tag quality only.

## Why tags matter

BM25 matches on keyword tokens — it has no understanding of intent. An example titled "Gmail: auto-summarize + reply" will not match a query for "auto-respond to support tickets" unless the tags supply the bridging words. Tags are the vocabulary gap filler: they surface what an agent might call the same thing, using synonyms, verb forms, and domain terms the description doesn't repeat.

---

## The tag categories

Use tags from multiple categories to give BM25 several independent hit paths.

### Capability tags — name the primary node or integration

Tag the node class name (lowercased) and the external service, if any.

Examples: `gmail`, `httprequest`, `aiagent`, `ocr`, `cron`, `webhook`, `mapdata`, `aggregate`, `split`, `filter`, `wait`, `subworkflow`, `callback`

### Pattern tags — name the workflow shape

Tag the structural pattern the example demonstrates.

Examples: `branching`, `polling`, `pipeline`, `fanout`, `fan-in`, `aggregation`, `auto-reply`, `validation`, `routing`, `conditional`, `multi-step`, `parallel`, `split`, `merge`

### Vertical / use-case tags — name the real-world domain

Tag what the workflow does in business terms — the words an agent uses when describing the problem.

Examples: `email`, `notification`, `procurement`, `support-ticket`, `customer-feedback`, `crm`, `database`, `store`, `collection`, `upload`, `file`, `document`

### Style tags — mark the example type

Every example must carry exactly one style tag. See [AUTHORING.md](AUTHORING.md#node-focused-vs-scenario-examples) for definitions.

- `style:node` — single-node focus; the surrounding workflow is scaffolding
- `style:scenario` — multi-node realistic use case; the workflow itself is the teaching unit

---

## Good tags vs bad tags

### Example 1 — Gmail trigger + auto-reply

```
❌  @tags email
✅  @tags email, gmail, trigger, auto-reply, notification, llm, summarize, aiagent, style:scenario
```

A query for "auto-respond to emails" or "reply to Gmail automatically" hits the good set. The bad set only hits queries that literally contain "email".

### Example 2 — Fan-out map → fan-in aggregate

```
❌  @tags processing
✅  @tags map, fanout, fan-in, parallel, array, split, aggregate, batch, transform, style:scenario
```

An agent asking "how do I process each item in a list" or "fan out then collect results" finds the good set on `split`, `fanout`, `parallel`. The bad set matches nothing useful.

### Example 3 — Chained LLM pipeline

```
❌  @tags llm, ai
✅  @tags llm, aiagent, pipeline, multi-step, chained, extract, enrich, summarize, managed-gateway, style:scenario
```

A query for "chain multiple agent steps" or "run LLM in sequence" hits `pipeline`, `chained`, `multi-step`. A query for "extract then summarize" hits `extract`, `summarize`.

### Example 4 — Webhook validation + DB write

```
❌  @tags integration
✅  @tags webhook, http, inbound, validation, zod, database, store, collection, persist, style:scenario
```

An agent asking "validate webhook payload" hits `validation`, `zod`. "Write incoming data to a collection" hits `store`, `collection`, `persist`.

### Example 5 — Cron-triggered API poll

```
❌  @tags scheduled
✅  @tags cron, polling, schedule, periodic, hourly, fetch, http, api, collection, store, style:scenario
```

Queries for "run every hour", "poll an API on a schedule", or "fetch periodically" all have hit paths. The bad tag is a stop-word-adjacent generic that matches nothing the agent would actually type.

---

## The "would the agent's query hit this?" test

Before committing a tag set, imagine three ways an agent might phrase the need:

1. A tool-level query: "how do I use `CronTrigger`?" → needs `cron` or `crontrigger`
2. A pattern-level query: "how do I schedule something to run every 5 minutes?" → needs `schedule`, `periodic`, `cron`
3. A domain-level query: "poll a REST API on a schedule and store new items" → needs `polling`, `api`, `rest`, `store`, `collection`

If none of those phrasings would hit at least two tokens in your tag set, expand it. You don't need every synonym — just enough breadth that the most natural phrasings all land.

---

## BM25 mechanics (brief)

- The tokenizer lowercases and splits on any non-alphanumeric character (`/[^a-z0-9]+/`). "Email" and "email" are the same token.
- Hyphens split tokens: `auto-reply` indexes as `auto` + `reply`, both independently searchable.
- Colons split tokens: `style:node` indexes as `style` + `node`.
- Common stop words ("a", "the", "is", "to") contribute almost no score — omit them.
- Tag the synonyms an agent might use: if the example uses `HttpRequest`, also tag `http`, `api`, `fetch`, `rest`, `request` where accurate.
- Each unique tag token boosts score independently. More relevant tokens = higher recall.

---

## Minimum bar

Every example must have at least 3 substantive tags. The recommended coverage is:

| Slot                | What to tag                                                             |
| ------------------- | ----------------------------------------------------------------------- |
| Primary capability  | The node name or integration (`gmail`, `httprequest`, `aiagent`)        |
| Alternate phrasings | 1–2 synonyms an agent might use instead (`email`, `http`, `llm`)        |
| Workflow shape      | The pattern demonstrated (`pipeline`, `fanout`, `branching`, `polling`) |
| Style               | `style:node` or `style:scenario`                                        |

Aim for 5–8 tags total. More is fine; diminishing returns set in after ~10.
