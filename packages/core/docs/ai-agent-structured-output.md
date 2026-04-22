# AIAgent structured output: how Codemation enforces OpenAI strict mode

`AIAgentNode.outputSchema` lets a workflow demand a **typed** final response from the model (validated with Zod before it is emitted as `item.json`). For OpenAI models that support **native structured output**, Codemation goes further than the Vercel AI SDK's default Zod → JSON Schema conversion: it converts your Zod schema to a JSON Schema that is guaranteed to satisfy OpenAI's **strict-mode** validator, so you never see:

```text
400 Invalid schema for response_format 'extract': In context=(), 'additionalProperties' is required to be supplied and to be false.
```

## Where the conversion happens

- **`OpenAiStrictJsonSchemaFactory`** (`@codemation/core-nodes`) takes the user's `ZodSchemaAny` and produces a plain draft-07 JSON Schema record.
- **`AgentStructuredOutputRunner`** decides per turn whether to use the strict record or the raw Zod schema:
  - For an OpenAI `ChatModelFactory` (see `resolveStructuredOutputOptions`), the record is wrapped with the AI SDK's **`jsonSchema(...)`** helper and handed to `generateText({ experimental_output: Output.object({ schema }) })`. `jsonSchema(...)` tags the schema with `Symbol.for("vercel.ai.schema")`, so the SDK passes our pre-built JSON Schema straight through to the provider without re-running its own Zod v4 → `draft-2020-12` conversion (which would otherwise emit `unevaluatedProperties: false` instead of `additionalProperties: false`, or skip strictification entirely when the root is not a `z.object(...)`).
  - For any other provider, the raw Zod schema is passed to `Output.object({ schema })` and the AI SDK handles its own Zod-to-JSON-Schema conversion.
- The original Zod schema is always used for **client-side validation** (`schema.parse(value)`) and for the **repair loop** prompt in `AgentStructuredOutputRunner`.
- Tool input schemas follow the same pattern: `AIAgentNode.buildToolSet` pre-converts each tool's Zod `inputSchema` via `AIAgentExecutionHelpersFactory.createJsonSchemaRecord` and wraps it with `jsonSchema(...)` before passing it to `generateText({ tools })` — so the AI SDK never has to guess which Zod version it is looking at, and the provider receives a draft-07 schema with `additionalProperties: false`.

## Rules the produced JSON Schema always satisfies

For every node that is an object (`type: "object"`, including objects nested inside `allOf` / `anyOf` / `oneOf` / `items` / `prefixItems` / `$defs`):

- `additionalProperties: false`
- `properties` is always an object (empty object allowed).
- `required` lists **every** key in `properties`.

Keywords stripped because OpenAI rejects (or ignores) them:

- `$schema`
- `unevaluatedProperties`
- `default`

Keywords preserved:

- `description` — OpenAI uses it as prompt context.
- `title` — set to the schema name.

## How to express optional fields under strict mode

OpenAI's strict structured output requires every property to appear in `required`. That means `z.string().optional()` alone is not enough — the model has to emit the key. Express "may be absent" as **nullable** instead of optional:

```ts
const orderSchema = z.object({
  reference: z.string(),
  // Good: nullable — the model emits `customerNote: null` when absent.
  customerNote: z.string().nullable(),
  // Good: explicit union with null.
  priority: z.union([z.literal("normal"), z.literal("urgent"), z.null()]),
});
```

If you use `.optional()` without `.nullable()`, the framework will still mark the key as required in the schema we hand to OpenAI (strict mode has no other option). You will typically want to use `.nullable()` so the client-side Zod parse accepts the `null` the model emits.

## Supported root shapes

All of these work as `outputSchema`:

- `z.object({ ... })`
- `z.discriminatedUnion("kind", [...])`
- `z.union([z.object({...}), z.object({...})])`
- `z.object({...}).nullable()` — the root becomes `{ anyOf: [{ type: "object", ... }, { type: "null" }] }`.
- `z.array(z.object({...}))`
- Arbitrarily nested combinations of the above.

## Interaction with the repair loop

When the model violates the schema (or the provider returns an error like a transient 500 / `AI_NoObjectGeneratedError`), `AgentStructuredOutputRunner` runs a bounded repair prompt that includes:

- The **exact JSON Schema** the model was asked to satisfy.
- The **invalid model output** (whatever the model last produced, even if it was not valid JSON).
- The Zod `validationError` message (or the underlying `summarizeError(...)` message for non-Zod failures).

The repair prompt goes out on the **plain text** model (no `experimental_output`), so even providers without native structured output get a chance to recover. The repair loop is capped at `AgentStructuredOutputRunner.repairAttemptCount` (2) — it cannot retry forever — and each call is made with `maxRetries: 0` so Codemation's repair policy is the single source of truth.

## FAQ

**Can I opt out of strict mode?** Not today. Strict mode is only requested for OpenAI-backed `ChatModelFactory` instances (see `resolveStructuredOutputOptions` in `AgentStructuredOutputRunner`). Other providers go through `generateText({ experimental_output: Output.object({ schema: <Zod> }) })` without a `strict` flag — `strict` is part of Codemation's `StructuredOutputOptions` contract, not an AI SDK call option.

**Why not rely on the AI SDK's default Zod → JSON Schema conversion?** Two reasons: (1) the AI SDK uses Zod v4's `toJSONSchema` with `draft-2020-12` / `draft-7` defaults that can emit `unevaluatedProperties: false` or skip `additionalProperties: false` on object branches that OpenAI strict mode requires; (2) the AI SDK's tool-input path runs feature-detection (`~standard`, `_zod`) that is brittle across Zod versions and bundling setups. Codemation converts once via `OpenAiStrictJsonSchemaFactory` / `AIAgentExecutionHelpersFactory.createJsonSchemaRecord`, with the right rules, and hands the AI SDK a pre-tagged `jsonSchema(...)` record to pass through verbatim.
