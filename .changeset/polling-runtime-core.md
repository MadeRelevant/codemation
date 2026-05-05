---
"@codemation/core": minor
"@codemation/core-nodes-gmail": patch
---

Extract generic polling-trigger machinery from gmail into core and expose it via setup context.

**`@codemation/core`** — new polling-trigger API

- New `PollingTriggerRuntime` class: owns the set-interval loop, overlap guard, and state persistence via `TriggerSetupStateRepository`. Plugin authors no longer need to implement these themselves.
- New `PollingTriggerDedupWindow` class: merges processed-ID sets with a configurable cap (default 2000). Prevents unbounded memory growth across polling cycles.
- New `PollingTriggerHandle` interface exposed on `TriggerSetupContext.polling`: pre-binds trigger id, emit, and registerCleanup so plugin code only supplies `intervalMs` and `runCycle`. The handle also carries a `.dedup` reference for message-level deduplication.
- `EngineDeps.pollingTriggerLogger` optional field: hosts may wire a real logger; defaults to a no-op.
- `PollingTriggerRuntime`, `PollingTriggerDedupWindow`, and `NoOpPollingTriggerLogger` are exported from the main `@codemation/core` barrel.
- ESLint `allowedConstructorNames` extended to include `AbortController` (a global built-in, not a DI-managed class).

**`@codemation/core-nodes-gmail`** — internal refactor, no external API change

- `GmailPollingTriggerRuntime` deleted; loop/overlap-guard/persistence now come from the core runtime.
- `GmailPollingService.poll` renamed to `runCycle`; repo injection and `persist()` method removed; dedup delegated to `PollingTriggerDedupWindow`.
- `OnNewGmailTriggerNode.setup` now calls `ctx.polling.start(...)` instead of `gmailPollingTriggerRuntime.ensureStarted(...)`.
- `GmailNodeTokens.RuntimeLogger` token removed (no longer needed).
