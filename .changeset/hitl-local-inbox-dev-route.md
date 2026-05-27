---
"@codemation/host": minor
"@codemation/next-host": minor
---

feat(hitl): LocalInboxChannel + /dev/inbox route (story 06)

- `LocalInboxChannel` — non-managed inbox channel that logs the task to the console and returns `inboxItemId === taskId`; registered unconditionally in the DI container
- `HumanTaskStore.findAllPending()` — new method for listing all pending tasks regardless of workspace (non-managed mode); implemented in `PrismaHumanTaskStore`
- `/dev/inbox` route in `next-host` — lists pending HITL tasks with approve/reject buttons; 404 in managed mode via `DevInboxAccessGuard` + layout gate
