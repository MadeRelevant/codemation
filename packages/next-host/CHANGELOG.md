# @codemation/next-host

## 0.1.9

### Patch Changes

- [#65](https://github.com/MadeRelevant/codemation/pull/65) [`261c240`](https://github.com/MadeRelevant/codemation/commit/261c240bccfd6e65bcd7cac439d501ef61b1f730) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix live workflow binary links so run-backed attachments open from the run binary endpoint instead of the debugger overlay endpoint, which avoids 404s for Gmail and other real execution binaries.

- [#64](https://github.com/MadeRelevant/codemation/pull/64) [`c44dad2`](https://github.com/MadeRelevant/codemation/commit/c44dad26529ac557f69ec986930389cc799aaefb) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix manual run execution so trigger-started workflows synthesize trigger preview items when no upstream trigger data exists yet.

  Add a lightweight `@codemation/host/authoring` entrypoint and update plugin sandbox imports so local dev no longer pulls heavy host server persistence modules into discovered plugin packages.

- Updated dependencies [[`c44dad2`](https://github.com/MadeRelevant/codemation/commit/c44dad26529ac557f69ec986930389cc799aaefb)]:
  - @codemation/host@0.2.1

## 0.1.8

### Patch Changes

- Updated dependencies [[`056c045`](https://github.com/MadeRelevant/codemation/commit/056c045d7813e7e6b749f0dc03bb43855ff7f58c)]:
  - @codemation/core@0.5.0
  - @codemation/host@0.2.0

## 0.1.7

### Patch Changes

- [#56](https://github.com/MadeRelevant/codemation/pull/56) [`eb97e53`](https://github.com/MadeRelevant/codemation/commit/eb97e5376f4f620099c32c14d7797ed3039bf7bb) Thanks [@cblokland90](https://github.com/cblokland90)! - Add fluent workflow authoring support for port routing and core nodes.
  - `workflow()` DSL: add `route(...)`, `merge(...)`, and `switch(...)` helpers so multi-port graphs can be expressed without manual `edges`.
  - `Callback`: allow returning `emitPorts(...)` and configuring declared output ports and error handling options.
  - Next host: fix execution inspector tree nesting by preferring `snapshot.parent.nodeId` when available (nested agent/tool invocations).

- Updated dependencies [[`35b78bb`](https://github.com/MadeRelevant/codemation/commit/35b78bb4d8c7ee2998a8b8e51e5ffc3fd901e4c7), [`eb97e53`](https://github.com/MadeRelevant/codemation/commit/eb97e5376f4f620099c32c14d7797ed3039bf7bb)]:
  - @codemation/core@0.4.0
  - @codemation/host@0.1.7

## 0.1.6

### Patch Changes

- Updated dependencies [[`bb2b3b8`](https://github.com/MadeRelevant/codemation/commit/bb2b3b89069697c6aa36aac1de7124c5eea65c3e)]:
  - @codemation/core@0.3.0
  - @codemation/host@0.1.6

## 0.1.5

### Patch Changes

- Updated dependencies [[`d3a4321`](https://github.com/MadeRelevant/codemation/commit/d3a4321dc178df51dfd61cc6eb872ccca36bbcdb)]:
  - @codemation/core@0.2.3
  - @codemation/host@0.1.5

## 0.1.4

### Patch Changes

- Updated dependencies [[`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f), [`74dc571`](https://github.com/MadeRelevant/codemation/commit/74dc571afb592bd7c05297b25f9f1fb06a46815f)]:
  - @codemation/core@0.2.2
  - @codemation/host@0.1.4

## 0.1.3

### Patch Changes

- Updated dependencies [[`4989e9c`](https://github.com/MadeRelevant/codemation/commit/4989e9c7d97513c05904d47d2f85794ba716a4d3)]:
  - @codemation/core@0.2.1
  - @codemation/host@0.1.3

## 0.1.2

### Patch Changes

- [#41](https://github.com/MadeRelevant/codemation/pull/41) [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5) Thanks [@cblokland90](https://github.com/cblokland90)! - Normalize run persistence around work items, execution instances, and run slot projections, while aligning the HTTP/UI run detail flow to run-centric naming. This also fixes AI agent tool schema serialization, nested tool item propagation, and execution inspector/canvas status handling for inline scheduler workflows.

- Updated dependencies [[`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5), [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5), [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5)]:
  - @codemation/host@0.1.2
  - @codemation/core@0.2.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4), [`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4)]:
  - @codemation/host@0.1.1
  - @codemation/core@0.1.0

## 0.1.0

### Minor Changes

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Move browser auth/session ownership into `@codemation/host` and make `@codemation/next-host` a thin UI client over the backend `/api/auth/*` surface.

  Update packaged dev/scaffolded flows so the CLI provides the public base URL and auth secret wiring needed for the new backend-owned session flow, and refresh the templates/docs to match the clean cutover away from the legacy NextAuth runtime.

### Patch Changes

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Align dev auth with the runtime API: proxy `/api/auth/*` through `CODEMATION_RUNTIME_DEV_URL` so SQLite has a single DB owner, tighten middleware path rules to avoid redundant session checks, and document root `pnpm dev` framework-author flow.

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Replace the local-development `pglite` path with SQLite across the host, CLI, scaffolding templates, and packaged dev flows while keeping PostgreSQL for production-aligned and shared integration scenarios.

  Split Prisma into provider-specific PostgreSQL and SQLite schema and migration tracks so generated clients and startup migrations select the correct backend without the old `pglite` socket adapter.

- Updated dependencies [[`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff), [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff), [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff)]:
  - @codemation/host@0.1.0

## 0.0.21

### Patch Changes

- [#33](https://github.com/MadeRelevant/codemation/pull/33) [`790e114`](https://github.com/MadeRelevant/codemation/commit/790e11456a19abe0db8ac4eca93b3357ea69e163) Thanks [@cblokland90](https://github.com/cblokland90)! - Publish a patch release to validate the full scaffolded auth startup release path from the packaged CLI through the packaged Next host.

  Keep the release loop exercised after tightening `main` to PR-only merges and after adding scaffolded browser coverage for auth-session startup.

## 0.0.20

### Patch Changes

- [#28](https://github.com/MadeRelevant/codemation/pull/28) [`b39cc51`](https://github.com/MadeRelevant/codemation/commit/b39cc51925162b5b46ac9d9653f3d9bf4a1eaf73) Thanks [@cblokland90](https://github.com/cblokland90)! - Fix Gmail trigger preview/manual-run regressions and restore fresh scaffold auth startup in the packaged Next host.

  Clarify the trigger item contract so integrations emit one workflow item per external event instead of wrapper payloads.

- Updated dependencies []:
  - @codemation/host@0.0.19

## 0.0.19

### Patch Changes

- Updated dependencies [[`405c854`](https://github.com/MadeRelevant/codemation/commit/405c8541961f41dcba653f352691a821b0470ca0)]:
  - @codemation/core@0.0.19
  - @codemation/host@0.0.19

## 0.0.18

### Patch Changes

- f0c6878: Introduce Changesets, a single CI status check for branch protection, and the Codemation pre-stable license across published packages.
- Updated dependencies [f0c6878]
  - @codemation/core@0.0.18
  - @codemation/host@0.0.18
