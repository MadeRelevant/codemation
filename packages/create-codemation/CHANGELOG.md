# create-codemation

## 0.0.24

### Patch Changes

- [#54](https://github.com/MadeRelevant/codemation/pull/54) [`35b78bb`](https://github.com/MadeRelevant/codemation/commit/35b78bb4d8c7ee2998a8b8e51e5ffc3fd901e4c7) Thanks [@cblokland90](https://github.com/cblokland90)! - **Breaking change:** `defineNode(...)` now follows the per-item pipeline: implement **`execute(args, context)`** (optional **`inputSchema`**, **`mapInput`**, and **`TWireJson`** on the generated runnable config). Add **`defineBatchNode(...)`** with **`run(items, context)`** for plugin nodes that still require batch **`run`** semantics.

  Built-in nodes and workflow DSL (`split` / `filter` / `aggregate` on the fluent chain, Switch routing, execution normalization) align with the unified runnable model.

  Align documentation (site guides, repo **`AGENTS.md`**, **`strict-oop-di`** skill, **`packages/core/docs/item-node-execution.md`**) and the **plugin** starter **`AGENTS.md`** with **config** for static wiring (credentials, retry, presentation) vs **inputs** / wire JSON for per-item behavior.

- Updated dependencies [[`35b78bb`](https://github.com/MadeRelevant/codemation/commit/35b78bb4d8c7ee2998a8b8e51e5ffc3fd901e4c7)]:
  - @codemation/agent-skills@0.1.5

## 0.0.23

### Patch Changes

- [#52](https://github.com/MadeRelevant/codemation/pull/52) [`bb2b3b8`](https://github.com/MadeRelevant/codemation/commit/bb2b3b89069697c6aa36aac1de7124c5eea65c3e) Thanks [@cblokland90](https://github.com/cblokland90)! - **Breaking change:** `defineNode(...)` now follows the per-item pipeline: implement **`executeOne(args, context)`** (optional **`inputSchema`**, **`mapInput`**, and **`TWireJson`** on the generated runnable config). Add **`defineBatchNode(...)`** with **`run(items, context)`** for plugin nodes that still require legacy batch **`Node.execute`** semantics.

  Align documentation (site guides, repo **`AGENTS.md`**, **`strict-oop-di`** skill, **`packages/core/docs/item-node-execution.md`**) and the **plugin** starter **`AGENTS.md`** with **config** for static wiring (credentials, retry, presentation) vs **inputs** / wire JSON for per-item behavior.

- Updated dependencies [[`bb2b3b8`](https://github.com/MadeRelevant/codemation/commit/bb2b3b89069697c6aa36aac1de7124c5eea65c3e)]:
  - @codemation/agent-skills@0.1.4

## 0.0.22

### Patch Changes

- [#41](https://github.com/MadeRelevant/codemation/pull/41) [`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5) Thanks [@cblokland90](https://github.com/cblokland90)! - Add `WorkflowTestKit` and related engine test harness exports on `@codemation/core/testing`, with create-codemation templates and agent skills updated to document plugin unit tests.

- Updated dependencies [[`a72444e`](https://github.com/MadeRelevant/codemation/commit/a72444e25c4e744a9a90e231a59c93f8d90346e5)]:
  - @codemation/agent-skills@0.1.3

## 0.0.21

### Patch Changes

- [#39](https://github.com/MadeRelevant/codemation/pull/39) [`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4) Thanks [@cblokland90](https://github.com/cblokland90)! - Add `WorkflowTestKit` and related engine test harness exports on `@codemation/core/testing`, with create-codemation templates and agent skills updated to document plugin unit tests.

- Updated dependencies [[`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4)]:
  - @codemation/agent-skills@0.1.2

## 0.0.20

### Patch Changes

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Replace the local-development `pglite` path with SQLite across the host, CLI, scaffolding templates, and packaged dev flows while keeping PostgreSQL for production-aligned and shared integration scenarios.

  Split Prisma into provider-specific PostgreSQL and SQLite schema and migration tracks so generated clients and startup migrations select the correct backend without the old `pglite` socket adapter.

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Move browser auth/session ownership into `@codemation/host` and make `@codemation/next-host` a thin UI client over the backend `/api/auth/*` surface.

  Update packaged dev/scaffolded flows so the CLI provides the public base URL and auth secret wiring needed for the new backend-owned session flow, and refresh the templates/docs to match the clean cutover away from the legacy NextAuth runtime.

- Updated dependencies [[`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff)]:
  - @codemation/agent-skills@0.1.1

## 0.0.19

### Patch Changes

- [#24](https://github.com/MadeRelevant/codemation/pull/24) [`cf5026a`](https://github.com/MadeRelevant/codemation/commit/cf5026a7c83353bb52d67a17d0b8a9ebceb91704) Thanks [@cblokland90](https://github.com/cblokland90)! - Add a publishable Codemation agent skills package and wire the default and plugin starters to extract the shared skills after install.

- Updated dependencies [[`cf5026a`](https://github.com/MadeRelevant/codemation/commit/cf5026a7c83353bb52d67a17d0b8a9ebceb91704)]:
  - @codemation/agent-skills@0.1.0

## 0.0.18

### Patch Changes

- f0c6878: Introduce Changesets, a single CI status check for branch protection, and the Codemation pre-stable license across published packages.
