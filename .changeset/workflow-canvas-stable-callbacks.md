---
"@codemation/next-host": patch
---

Fix stale canvas toolbar callbacks after controller state updates.

`useAsyncWorkflowLayout` retriggered the async ELK layout whenever any
handler prop (e.g. `onRunNode`, `onTogglePinnedOutput`) changed
identity. Between a controller state mutation (like pinning an output)
and ELK resolving the new layout, the rendered React Flow node data
still referenced the previous closure — so invoking "run to here"
immediately after a pin fired the pre-pin handler and dispatched a run
request without the just-saved `mutableState`.

Callback props are now routed through refs, and the layout hook
forwards stable wrappers that always delegate to the latest closure.
Handler identity is removed from the layout effect's dependency array
so the canvas toolbar reflects controller state synchronously,
without waiting for an ELK round-trip.
