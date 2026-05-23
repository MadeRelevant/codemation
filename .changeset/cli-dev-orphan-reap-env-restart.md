---
"@codemation/cli": patch
---

`codemation dev` now reaps a prior session's process + port instead of refusing to start, and reloads consumer `.env*` files in place instead of asking the user to restart manually.

`DevLock.acquire` on `EEXIST`: SIGTERM the recorded pid and its process group, then `lsof` the recorded port and SIGTERM anything still holding it (covers detached children that outlived a crashed CLI parent). SIGKILL fallback on stragglers; port-free poll is the real gate.

`DevCommand` env-only change handler: re-reads `consumerEnvLoader.load(consumerRoot)` and updates `prepared.consumerEnv` in place, then enqueues a normal rebuild. The runtime spawn picks up the fresh values.
