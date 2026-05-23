---
"@codemation/cli": patch
---

Fix: dev proxy now opens the per-client upstream WS to the runtime BEFORE signaling `{kind:"ready"}` to the browser client. Previously the proxy sent `ready` immediately and opened the upstream asynchronously — clients that subscribed to a workflow room right after `ready` had their subscribe silently dropped because `state.childSocket` was still null. For workflows that finish in ~150ms (e.g. a `Wait(0)` + `Callback`), the run completed before the upstream opened and re-issued the subscription, so no `runCreated`/`nodeStarted`/`runSaved` events ever reached the browser.

Now we await the upstream open, then send `ready`. Subscriptions land on a real upstream socket the moment they arrive.
