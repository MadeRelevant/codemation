---
"@codemation/core-nodes-gmail": patch
---

Migrate gmail dev workflows from `apps/test-dev` into `packages/core-nodes-gmail/dev/`. The plugin's sandbox now discovers `./dev/workflows`, so `cd packages/core-nodes-gmail && pnpm dev` boots the gmail demos directly. `apps/test-dev` no longer depends on `@codemation/core-nodes-gmail`.
