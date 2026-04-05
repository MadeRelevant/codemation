# create-codemation

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
