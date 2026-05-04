---
"@codemation/eslint-config": patch
---

Relax architecture ESLint rules for plugin packages (`packages/core-nodes-*`).

Plugin packages — third-party-style integrations that wrap external SDKs — opt out of the framework's DI-heavy rules so they can be written in a flatter, easier-to-read module style. The `single-class-per-file`, `no-manual-di-new`, `no-static-methods`, and root-level/exported-function bans are disabled for `packages/core-nodes-*/src/**`. General TS hygiene, logger discipline (no `console.log`), and `process.env` restrictions still apply.
