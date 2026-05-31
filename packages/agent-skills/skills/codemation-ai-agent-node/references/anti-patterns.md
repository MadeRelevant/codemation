# AIAgent anti-patterns (version-specific)

## Managed model ids change between releases

Do NOT hard-code managed model ids sourced from training data. The allowlisted set changes with each release.
Always discover the live list via `GET <CONTROL_PLANE_URL>/api/llm/managed-models` before committing a model id.

## `chatModel` string shorthand is not supported on AIAgent

`AIAgent` does not accept a plain string for `chatModel` — only `CodemationChatModelConfig` or `OpenAIChatModelConfig` instances.
(The string shorthand `model: "openai:gpt-4o-mini"` works on the `.agent(...)` fluent DSL helper only.)
