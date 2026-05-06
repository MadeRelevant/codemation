---
---

Split the CI `core` path filter into `core` (engine-only — `packages/core/**`) and `core_nodes` (`packages/core-nodes*/`, `agent-skills`, `cli`, `create-codemation`, `eventbus-redis`). Coverage gates updated so node-package changes only trigger unit + integration + integration-sqlite — UI / browser / e2e are skipped (those exercise the engine and host, not plugin nodes). Cuts ~13min off CI for typical node-only PRs.
