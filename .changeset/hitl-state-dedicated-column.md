---
"@codemation/host": patch
---

fix(host): migrate HITL state from mutable_state_json stash to dedicated hitl_state_json column

Replaces the interim `_hitl*` key stash inside `mutable_state_json` (commit 63a6cfb3) with a
proper `hitl_state_json` column on the `Run` table. `suspension`, `pendingResume`, and `reason`
are now serialised to the new column on save; old rows with the `_hitl*` stash are transparently
hydrated via a legacy fallback on load (to be removed after one release cycle).
