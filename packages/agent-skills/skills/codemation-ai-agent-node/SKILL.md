---
name: codemation-ai-agent-node
description: AIAgent constructor, message shape, managed and BYOK chatModel configs, outputSchema, mcpServers. Read before writing any workflow step that calls an LLM.
compatibility: Codemation core-nodes. Requires @codemation/core-nodes import.
tags: agent, llm, ai
uses: "@codemation/core-nodes"
---

# Codemation AI Agent Node

## Mental model

`AIAgent` is the single building block for any LLM step in a workflow. It receives items, runs a chat completion per item using the configured model and messages, and emits `{ output: string }` (or a parsed object when `outputSchema` is set) on its `main` port. The `chatModel` field determines whether the run consumes Codemation-managed quota (no credential needed) or a BYOK key the operator supplies. Every AIAgent emits exactly one output item per input item — it never fans out or filters.

## When to use / when NOT

Use `AIAgent` when a workflow step needs an LLM call: classification, extraction, summarisation, drafting, or decision.
Use a plain `Callback` instead when the logic is deterministic code — no LLM needed.
Use `mcpServers` (see `codemation-mcp-capabilities`) when the agent needs tool access to external services.
Read `codemation-workflow-dsl` for the surrounding workflow structure.

## Quickstart

```ts
import { AIAgent, CodemationChatModelConfig } from "@codemation/core-nodes";

new AIAgent({
  name: "Classify email",
  messages: [
    { role: "system", content: "Classify the email as spam or not-spam." },
    { role: "user", content: (args) => args.item.json.body as string },
  ],
  chatModel: new CodemationChatModelConfig("Claude Haiku", "anthropic/claude-haiku-4-5-20251001"),
});
```

For full patterns — BYOK (`OpenAIChatModelConfig`), `outputSchema`, tools, multi-step pipelines, and gmail classification — use your harness's example-discovery tool: `find_examples({ query: "AIAgent" })`.

## Decision branches & gotchas

**Managed mode (default — no API key needed):** use `CodemationChatModelConfig(label, modelId)`. In managed mode the LLM broker **auto-authenticates via the workspace HMAC pairing** — no API key, no credential slot, no user setup required. This is the correct default for all managed-mode workflows. Do NOT tell managed users to "get an API key" — the broker handles authentication transparently.

```ts
chatModel: new CodemationChatModelConfig("Claude Haiku", "anthropic/claude-haiku-4-5-20251001")
// No credential slot created. Discover live model ids:
// GET <CONTROL_PLANE_URL>/api/llm/managed-models
```

**BYOK (self-hosted / non-managed only):** use `OpenAIChatModelConfig(label, modelId, slotKey)` — it creates a credential slot the operator must bind with an API key. Only use this in self-hosted deployments where no managed broker is available.

**Messages:** `content` is a plain string or a function `(args: { item, itemIndex, items, ctx }) => string`. Put instructions in the `system` message, per-item data in the `user` message. Use `"assistant"` role only for few-shot examples.

**Structured output:** add `outputSchema: z.object({...})` to validate and parse the response. Without it, `item.json.output` is always a plain string.

**Stable node id:** if the node has a credential binding (BYOK), set an explicit `id:` on the constructor. Without it the id derives from the `name` label — renaming the label orphans the binding. See `codemation-workflow-dsl` for the full id-stability rule.

**Downstream access:** the next node sees `item.json.output` as the agent's text response. Cast it via a typed `Callback<{ output: string }>`.

## Anti-patterns

- Do not tell managed users to get an API key — use `CodemationChatModelConfig`; the broker authenticates automatically.
- Do not use `OpenAIChatModelConfig` in managed mode — it creates an unnecessary credential slot and will prompt the user to bind a key they don't need.
- Do not use `AIAgent` for deterministic logic; use `Callback` instead (cheaper, faster, no LLM billing).
- Do not attempt to return multiple items from a single `AIAgent` step — it emits exactly one output per input.

See `references/anti-patterns.md` for version-specific gotchas (managed model id churn, chatModel string shorthand trap).
