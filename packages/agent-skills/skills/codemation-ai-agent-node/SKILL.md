---
name: codemation-ai-agent-node
description: AIAgent constructor, message shape, output contract, and chat-model configs (managed and BYOK). Read before writing any workflow that uses AIAgent.
compatibility: Codemation core-nodes. Requires @codemation/core-nodes import.
---

# Codemation AI Agent Node

> **Start here: call `find_examples` before reading further.**
>
> - `find_examples({ query: "AIAgent" })` — basic usage and constructor patterns
> - `find_examples({ query: "AIAgent multi-step" })` — chained pipeline patterns
> - `find_examples({ query: "AIAgent tools" })` — agent with callable tools
> - `find_examples({ query: "AIAgent gmail classify" })` — domain-specific examples
>
> The sections below are a quick orientation for when you need the exact constructor or output shape.

## Use this skill when

Writing a workflow that uses `AIAgent` — classification, extraction, summarisation, drafting, decision, or any step that calls an LLM.
Use `codemation-workflow-dsl` for the surrounding workflow structure.
Use `codemation-mcp-capabilities` when the agent needs MCP servers.

## When to use `AIAgent` vs other approaches

Use `AIAgent` when an item needs an LLM call with a fixed or per-item prompt and optional tool use.
Use a plain `Callback` instead when the logic is deterministic code (no LLM needed).
Use the `.agent(...)` fluent helper on a manual-trigger workflow only if you need the full fluent chain sugar — under the hood it also produces an `AIAgent`.

## Constructor

```ts
import { AIAgent } from "@codemation/core-nodes";

new AIAgent({
  name: string,                          // display name and default node id slug
  messages: AgentMessageConfig,          // see below
  chatModel: ChatModelConfig,            // see Managed and BYOK sections below
  tools?: ReadonlyArray<ToolConfig>,     // optional callable tools
  id?: string,                           // stable node id (set explicitly if node has credential bindings)
})
```

## `messages` shape

`messages` is an ordered array of `{ role, content }` objects.

```ts
messages: [
  { role: "system", content: "You are a helpful assistant that classifies emails." },
  { role: "user", content: (args) => `Classify this email:\n\n${args.item.json.body}` },
];
```

- `role` is `"system"` | `"user"` (use `"assistant"` only for few-shot examples — rare).
- `content` can be a plain string or a function `(args: { item, itemIndex, items, ctx }) => string`.
- Put the detailed instructions in the `system` message and the per-item data in the `user` message.

## Output shape

`AIAgent` emits `{ output: string }` on its single port `main`.

The next node sees `item.json.output` as the agent's text response.
Type your downstream `Callback` accordingly:

```ts
.then(new Callback<{ output: string }>("Handle result", (item) => {
  const reply = item.json.output;
  // ...
}))
```

If you set `outputSchema` (a Zod schema), the agent validates and parses the output into a structured object. Without `outputSchema`, `item.json.output` is always a plain string.

## Managed model (no credentials needed)

```ts
import { AIAgent, CodemationChatModelConfig } from "@codemation/core-nodes";

new AIAgent({
  name: "Classify email",
  messages: [
    { role: "system", content: "Classify the email as spam or not-spam." },
    { role: "user", content: (args) => args.item.json.body as string },
  ],
  chatModel: new CodemationChatModelConfig(
    "Claude Haiku", // display label
    "anthropic/claude-haiku-4-5-20251001", // managed model id
  ),
});
```

### Currently allowlisted managed models

| Model id                              | Notes                |
| ------------------------------------- | -------------------- |
| `anthropic/claude-haiku-4-5-20251001` | Fastest and cheapest |
| `anthropic/claude-sonnet-4-6`         | Balanced             |
| `anthropic/claude-opus-4-5-20251101`  | High capability      |
| `anthropic/claude-opus-4-6`           | Latest flagship      |

Discover live: `GET <CONTROL_PLANE_URL>/api/llm/managed-models`

## BYOK model (user supplies their own key)

```ts
import { AIAgent, OpenAIChatModelConfig } from "@codemation/core-nodes";

new AIAgent({
  name: "Summarise",
  id: "summarise-agent", // stable id — required when node has a credential binding
  messages: [
    { role: "system", content: "Summarise the following text in one paragraph." },
    { role: "user", content: (args) => args.item.json.text as string },
  ],
  chatModel: new OpenAIChatModelConfig(
    "OpenAI GPT-4o", // display label
    "gpt-4o", // OpenAI model id
    "openai", // credential slot key — matches the slot used in getCredentialRequirements
  ),
});
```

`OpenAIChatModelConfig` requires the user to connect an `openai.apiKey` credential. The concierge handles credential acquisition — the coding agent must not invent credentials.

## MCP servers

If you need tools / MCP servers on the agent, see the `codemation-mcp-capabilities` skill.
