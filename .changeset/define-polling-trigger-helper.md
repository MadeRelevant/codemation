---
"@codemation/core": minor
---

Add `definePollingTrigger` helper for declarative polling trigger authoring.

Plugin authors can now define polling triggers with a single `definePollingTrigger({...})` call instead of manually wiring `PollingTriggerRuntime` + `RunnableNodeConfig` + `@node` class pairs. The helper synthesises both the trigger config class and the runtime adapter, handles internal dedup-key bookkeeping, and exposes a `poll()` test seam for unit testing without spinning up the runtime.
