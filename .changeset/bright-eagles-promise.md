---
"@codemation/core": patch
"@codemation/host": patch
---

Fix manual trigger reruns and current-state resume behavior.

Current-state execution now treats empty upstream outputs like the live queue planner, so untaken branches stay dead on resume. Manual downstream runs can also synthesize trigger test items through core intent handling instead of relying on host-specific trigger logic.
