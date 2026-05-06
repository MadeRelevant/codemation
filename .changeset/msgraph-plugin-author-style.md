---
"@codemation/core-nodes-msgraph": minor
---

Convert the package from framework-author style (RunnableNodeConfig + RunnableNode class pair + `@node()` decorator + manual `ctx.registerNode` plumbing) to the plugin-author style demonstrated in `packages/create-codemation/templates/plugin/`. Each node is now a single declarative `defineNode({...})` (or `defineRestNode` / `definePollingTrigger`); credentials use `defineCredential({...})`; the composition root is a single `definePlugin({ credentials, nodes, sandbox })` call.

Net change: 61 files, +2,788 / −5,671 lines (-2,883). No runtime behaviour change — every existing regression test still passes, every fix from this PR (DriveResolve `/`, item.json fallback, ReadableStream branch, ExcelStyleRange separate PATCHes, ExcelAddSheet idempotency, OnNewMail contentId type-cast, flat WorkbookHandle output) is preserved in the new declarative implementations.
