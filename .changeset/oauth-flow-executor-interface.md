---
"@codemation/core": minor
---

Define `OAuthFlowExecutor` interface — the mode-agnostic contract for the OAuth dance (start → callback → token storage) and refresh. Implementations (local and managed) will register behind this single interface via DI.
