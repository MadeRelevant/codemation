---
"@codemation/canvas-core": patch
---

Fix second `credentials: "omit"` site in `createWorkflowCanvasApiClient` — the
debugger-overlay binary upload helper had the same conditional as the primary
fetch helper (`token === null ? "same-origin" : "omit"`), which breaks the
upload when the canvas client is configured against a same-origin proxy whose
upstream gate requires the session cookie. Now always `"same-origin"`, matching
the primary helper fixed in #171.
