# @codemation/agent-skills

## 0.1.2

### Patch Changes

- [#39](https://github.com/MadeRelevant/codemation/pull/39) [`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4) Thanks [@cblokland90](https://github.com/cblokland90)! - Add `WorkflowTestKit` and related engine test harness exports on `@codemation/core/testing`, with create-codemation templates and agent skills updated to document plugin unit tests.

## 0.1.1

### Patch Changes

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Replace the local-development `pglite` path with SQLite across the host, CLI, scaffolding templates, and packaged dev flows while keeping PostgreSQL for production-aligned and shared integration scenarios.

  Split Prisma into provider-specific PostgreSQL and SQLite schema and migration tracks so generated clients and startup migrations select the correct backend without the old `pglite` socket adapter.

## 0.1.0

### Minor Changes

- [#24](https://github.com/MadeRelevant/codemation/pull/24) [`cf5026a`](https://github.com/MadeRelevant/codemation/commit/cf5026a7c83353bb52d67a17d0b8a9ebceb91704) Thanks [@cblokland90](https://github.com/cblokland90)! - Add a publishable Codemation agent skills package and wire the default and plugin starters to extract the shared skills after install.

## 0.0.18

### Patch Changes

- f0c6878: Introduce Changesets, a single CI status check for branch protection, and the Codemation pre-stable license across published packages.
