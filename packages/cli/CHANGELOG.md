# @codemation/cli

## 0.0.23

### Patch Changes

- Updated dependencies [[`cbfe843`](https://github.com/MadeRelevant/codemation/commit/cbfe843ef2363e400a219f4d0bcd05b091ab83b4)]:
  - @codemation/host@0.1.1
  - @codemation/next-host@0.1.1

## 0.0.22

### Patch Changes

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Route `/api/auth/*` on the dev gateway to the disposable API runtime (same as other `/api/*` routes) so host-owned Better Auth is not bounced through the Next UI process. Avoids gateway↔Next proxy loops when `CODEMATION_RUNTIME_DEV_URL` points at the stable dev URL.

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Replace the local-development `pglite` path with SQLite across the host, CLI, scaffolding templates, and packaged dev flows while keeping PostgreSQL for production-aligned and shared integration scenarios.

  Split Prisma into provider-specific PostgreSQL and SQLite schema and migration tracks so generated clients and startup migrations select the correct backend without the old `pglite` socket adapter.

- [#35](https://github.com/MadeRelevant/codemation/pull/35) [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff) Thanks [@cblokland90](https://github.com/cblokland90)! - Move browser auth/session ownership into `@codemation/host` and make `@codemation/next-host` a thin UI client over the backend `/api/auth/*` surface.

  Update packaged dev/scaffolded flows so the CLI provides the public base URL and auth secret wiring needed for the new backend-owned session flow, and refresh the templates/docs to match the clean cutover away from the legacy NextAuth runtime.

- Updated dependencies [[`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff), [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff), [`75b885b`](https://github.com/MadeRelevant/codemation/commit/75b885b111cc34ffe3a192ca9cc8cd3864fdf8ff)]:
  - @codemation/host@0.1.0
  - @codemation/next-host@0.1.0

## 0.0.21

### Patch Changes

- [#33](https://github.com/MadeRelevant/codemation/pull/33) [`790e114`](https://github.com/MadeRelevant/codemation/commit/790e11456a19abe0db8ac4eca93b3357ea69e163) Thanks [@cblokland90](https://github.com/cblokland90)! - Publish a patch release to validate the full scaffolded auth startup release path from the packaged CLI through the packaged Next host.

  Keep the release loop exercised after tightening `main` to PR-only merges and after adding scaffolded browser coverage for auth-session startup.

- Updated dependencies [[`790e114`](https://github.com/MadeRelevant/codemation/commit/790e11456a19abe0db8ac4eca93b3357ea69e163)]:
  - @codemation/next-host@0.0.21

## 0.0.20

### Patch Changes

- Updated dependencies [[`b39cc51`](https://github.com/MadeRelevant/codemation/commit/b39cc51925162b5b46ac9d9653f3d9bf4a1eaf73)]:
  - @codemation/next-host@0.0.20
  - @codemation/host@0.0.19

## 0.0.19

### Patch Changes

- Updated dependencies [[`405c854`](https://github.com/MadeRelevant/codemation/commit/405c8541961f41dcba653f352691a821b0470ca0)]:
  - @codemation/host@0.0.19
  - @codemation/next-host@0.0.19

## 0.0.18

### Patch Changes

- f0c6878: Introduce Changesets, a single CI status check for branch protection, and the Codemation pre-stable license across published packages.
- Updated dependencies [f0c6878]
  - @codemation/host@0.0.18
  - @codemation/next-host@0.0.18
