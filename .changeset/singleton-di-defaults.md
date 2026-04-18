---
"@codemation/core": patch
"@codemation/core-nodes-gmail": patch
"@codemation/host": patch
---

Default DI container registrations to singletons so framework services that own long-lived resources (timers, subscriptions, sockets) have deterministic lifecycles. Previously `container.register(Class, { useClass: Class })` produced a new instance per resolution, which caused the `WorkflowRunRetentionPruneScheduler` `setInterval` timer to leak across HMR reloads and blocked `pnpm dev` from shutting down on Ctrl+C.

Public registration DTOs still accept `useClass` as a shape hint, but the host applies every class-based registration as a singleton. Plugin authors using `plugin.register({ registerNode, registerClass })` and consumers using `containerRegistrations: [{ token, useClass }]` no longer need to reason about lifecycle. Redundant `@registry([{ useClass }])` decorators on Hono route registrars and domain event handlers have been removed.

A new ESLint rule (`codemation/no-transient-container-register`) prevents reintroducing `.register(token, { useClass: Class })` and `@registry([{ useClass: Class }])` patterns across `packages/**` and `apps/**`.
